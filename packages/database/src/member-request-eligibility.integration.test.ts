import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { createCanonicalId,ProductCatalogMetadataV1Schema } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';

const databaseUrl=process.env.DATABASE_URL;
it.skipIf(!databaseUrl)('direct service membership requests require a ready catalog and every tenant role permission',async()=>{
 const suffix=randomBytes(6).toString('hex'),role=`ch_request_${suffix}`,statusRole=`ch_request_status_${suffix}`,password=randomBytes(20).toString('hex');
 const admin=new Client({connectionString:databaseUrl});await admin.connect();
 await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
 await admin.query(`GRANT company_human_service TO ${role}`);
 // Privileged status fixture, outside the service mutation guard. No app
 // credential receives this role or its BYPASSRLS property.
 await admin.query(`CREATE ROLE ${statusRole} LOGIN PASSWORD '${password}' BYPASSRLS`);
 await admin.query(`GRANT USAGE ON SCHEMA public TO ${statusRole}`);
 await admin.query(`GRANT SELECT(id,status),UPDATE(status) ON organizations TO ${statusRole}`);
 const endpoint=new URL(databaseUrl!);endpoint.username=role;endpoint.password=password;
 const service=new Client({connectionString:endpoint.toString()});await service.connect();
 const statusEndpoint=new URL(databaseUrl!);statusEndpoint.username=statusRole;statusEndpoint.password=password;
 const statusSql=new Client({connectionString:statusEndpoint.toString()});await statusSql.connect();
 const observer=new Client({connectionString:databaseUrl});await observer.connect();
 const actor=await syncAuthUser(databaseUrl!,{authIssuer:'https://member-request.test',authSubject:`actor-${suffix}`,displayName:'Actor',primaryEmail:null,status:'active',eventTimestamp:1});
 const target=await syncAuthUser(databaseUrl!,{authIssuer:'https://member-request.test',authSubject:`target-${suffix}`,displayName:'Target',primaryEmail:null,status:'active',eventTimestamp:1});
 const otherActor=await syncAuthUser(databaseUrl!,{authIssuer:'https://member-request.test',authSubject:`other-${suffix}`,displayName:'Other',primaryEmail:null,status:'active',eventTimestamp:1});
 const a=await createOrganization(databaseUrl!,{ownerUserId:actor,name:'A',slug:`request-a-${suffix}`});
 const b=await createOrganization(databaseUrl!,{ownerUserId:otherActor,name:'B',slug:`request-b-${suffix}`});
 const member=createCanonicalId('membership'),product=createCanonicalId('product'),instance=createCanonicalId('productInstance'),foreignInstance=createCanonicalId('productInstance');
 const meta=(requiredPermissions:unknown)=>({schemaVersion:1,description:'Fixture',category:'sales',supportedCapabilities:[],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:[],requiredPermissions,adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:[]});
 const insert=async(org:string,inst:string,person:string)=>service.query(`INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id)
   VALUES($1,$2,$3,$4,$5)`,[createCanonicalId('productMembership'),org,inst,person,actor]);
 const context=async(org:string)=>service.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[actor,org]);
 const nextInstance=async(key:string)=>{const id=createCanonicalId('productInstance');
  await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,$4,'connected','active',$2,$5)",[id,a.organizationId,product,key,actor]);return id;};
 const waited=async(marker:string)=>{for(let n=0;n<200;n++){
  const result=await observer.query("SELECT wait_event_type FROM pg_stat_activity WHERE datname=current_database() AND query LIKE $1 AND state='active'",[`%${marker}%`]);
  if(result.rows.some(row=>row.wait_event_type==='Lock'))return true;
  await new Promise(done=>setTimeout(done,10));
 }return false;};
 try{
  await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')",[member,a.organizationId,target]);
  await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','draft',$3)",[product,`request-${suffix}`,meta(['product.use'])]);
  await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'main','connected','active',$2,$4)",[instance,a.organizationId,product,actor]);
  await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'foreign','connected','active',$2,$4)",[foreignInstance,b.organizationId,product,otherActor]);
  await context(a.organizationId);
  expect((await service.query("SELECT company_human_private.member_request_eligible($1,$2,$3) eligible",[a.organizationId,instance,member])).rows[0].eligible).toBe(false);
  await expect(insert(a.organizationId,instance,member)).rejects.toThrow();
  await admin.query("UPDATE products SET catalog_status='ready' WHERE id=$1",[product]);
  expect((await service.query("SELECT company_human_private.member_request_eligible($1,$2,$3) eligible",[a.organizationId,instance,member])).rows[0].eligible).toBe(true);
  await expect(insert(a.organizationId,foreignInstance,member)).rejects.toThrow();
  await expect(insert(b.organizationId,foreignInstance,b.ownerMembershipId)).rejects.toThrow();
  await expect(insert(a.organizationId,instance,b.ownerMembershipId)).rejects.toThrow();
  await admin.query("UPDATE products SET catalog_metadata=$2 WHERE id=$1",[product,meta(['product.use','billing.read.all'])]);
  expect((await service.query("SELECT company_human_private.member_request_eligible($1,$2,$3) eligible",[a.organizationId,instance,member])).rows[0].eligible).toBe(false);
  await expect(insert(a.organizationId,instance,member)).rejects.toThrow();
  const contributorRole=(await admin.query("SELECT role_id FROM memberships WHERE id=$1",[member])).rows[0].role_id;
  await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'billing.read.all')",[a.organizationId,contributorRole]);
  expect((await service.query("SELECT company_human_private.member_request_eligible($1,$2,$3) eligible",[a.organizationId,instance,member])).rows[0].eligible).toBe(true);
  for(const invalid of ['billing.made.up',4,{'not':'a string'}]){
   await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,meta(['product.use',invalid])]);
   await expect(insert(a.organizationId,instance,member)).rejects.toThrow();
  }
  await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,meta('product.use')]);
  await expect(insert(a.organizationId,instance,member)).rejects.toThrow();
  for(const invalid of [
   {...meta(['product.use']),provisioningModes:[]},
   {...meta(['product.use']),supportedCapabilities:[42]},
   {...meta(['product.use']),deepLinks:{app:'not-a-url'}},
   {...meta(['product.use']),unexpected:'extra'},
  ]){
   await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,invalid]);
   expect((await service.query("SELECT company_human_private.member_request_eligible($1,$2,$3) eligible",[a.organizationId,instance,member])).rows[0].eligible).toBe(false);
   await expect(insert(a.organizationId,instance,member)).rejects.toThrow();
  }
  for(const incompatible of [
   {...meta(['product.use']),provisioningModes:['provisioned']},
   {...meta(['product.use']),supportedMemberOperations:['suspend']},
  ]){
   expect(ProductCatalogMetadataV1Schema.safeParse(incompatible).success).toBe(true);
   await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,incompatible]);
   expect((await service.query('SELECT company_human_private.ready_catalog_metadata_valid($1::jsonb) valid',[JSON.stringify(incompatible)])).rows[0].valid).toBe(true);
   expect((await service.query('SELECT company_human_private.member_request_eligible($1,$2,$3) eligible',[a.organizationId,instance,member])).rows[0].eligible).toBe(false);
   await expect(insert(a.organizationId,instance,member)).rejects.toThrow();
  }
  // The SQL URL validator intentionally accepts an HTTP(S) subset of Zod's
  // URL type. Within that subset it agrees on ordinary and invalid ports.
  for(const [candidate,expected] of [
   ['https://example.com/app',true],['http://localhost:3000/a',true],
   ['https://example.com:65535/x',true],['https://example.com:00000/x',true],
   ['https://example.com:65536/x',false],['https://example.com:99999/x',false],
   ['https://',false],['not-a-url',false],
  ] as const){
   const withUrl={...meta(['product.use']),iconUrl:candidate,healthEndpoint:candidate,deepLinks:{app:candidate}};
   expect(ProductCatalogMetadataV1Schema.safeParse(withUrl).success).toBe(expected);
   expect((await service.query('SELECT company_human_private.ready_catalog_metadata_valid($1::jsonb) valid',[JSON.stringify(withUrl)])).rows[0].valid).toBe(expected);
  }
  await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,meta([])]);
  await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='product.use'",[a.organizationId,contributorRole]);
  await expect(insert(a.organizationId,instance,member)).rejects.toThrow();
  await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'product.use')",[a.organizationId,contributorRole]);
  // Edit commits first: the direct INSERT waits on catalog authority and
  // evaluates eligibility after the changed catalog is visible.
  await admin.query('BEGIN');
  await admin.query("UPDATE products SET catalog_status='draft' WHERE id=$1",[product]);
  const afterEdit=service.query(`/* member request wait after edit */ INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id)
   VALUES($1,$2,$3,$4,$5)`,[createCanonicalId('productMembership'),a.organizationId,instance,member,actor]);
  void afterEdit.catch(()=>{});
  const observedEditWait=await waited('member request wait after edit');
  await admin.query('COMMIT');
  expect(observedEditWait).toBe(true);
  await expect(afterEdit).rejects.toThrow();
  // Request commits first: catalog update waits on the request's advisory
  // lock and can then invalidate the existing pending intent normally.
  await admin.query("UPDATE products SET catalog_status='ready' WHERE id=$1",[product]);
  await service.query('BEGIN');
  await insert(a.organizationId,instance,member);
  const afterRequest=admin.query("/* catalog edit wait after request */ UPDATE products SET catalog_status='draft' WHERE id=$1",[product]);
  const observedRequestWait=await waited('catalog edit wait after request');
  await service.query('COMMIT');
  await afterRequest;
  expect(observedRequestWait).toBe(true);
  expect((await admin.query('SELECT count(*)::int n FROM product_memberships WHERE organization_id=$1 AND membership_id=$2',[a.organizationId,member])).rows[0].n).toBe(1);
  // Role revocation uses the other shared lock. A direct INSERT must observe
  // the winning grant state, including when the service request starts first.
  await admin.query("UPDATE products SET catalog_status='ready' WHERE id=$1",[product]);
  const ownerRole=(await admin.query('SELECT role_id FROM memberships WHERE id=$1',[a.ownerMembershipId])).rows[0].role_id;
  await admin.query('BEGIN');
  await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='product.use'",[a.organizationId,ownerRole]);
  const afterRevocation=service.query(`/* member request wait after revocation */ INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id)
   VALUES($1,$2,$3,$4,$5)`,[createCanonicalId('productMembership'),a.organizationId,instance,a.ownerMembershipId,actor]);
  void afterRevocation.catch(()=>{});
  const observedRevocationWait=await waited('member request wait after revocation');
  await admin.query('COMMIT');
  expect(observedRevocationWait).toBe(true);
  await expect(afterRevocation).rejects.toThrow();
  await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'product.use')",[a.organizationId,ownerRole]);
  await service.query('BEGIN');
  await insert(a.organizationId,instance,a.ownerMembershipId);
  const revokeAfterRequest=admin.query("/* role revoke wait after request */ DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='product.use'",[a.organizationId,ownerRole]);
  const observedRevokeWait=await waited('role revoke wait after request');
  await service.query('COMMIT');
  await revokeAfterRequest;
  expect(observedRevokeWait).toBe(true);
  expect((await admin.query('SELECT count(*)::int n FROM product_memberships WHERE organization_id=$1 AND membership_id=$2',[a.organizationId,a.ownerMembershipId])).rows[0].n).toBe(1);
  await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'product.use')",[a.organizationId,ownerRole]);
  // Organization suspension and a request are serialized by the shared
  // organization-access lock, regardless of which starts first.
  const orgFirst=await nextInstance('org-first');
  await statusSql.query('BEGIN');
  await statusSql.query("UPDATE organizations SET status='suspended' WHERE id=$1",[a.organizationId]);
  const afterOrgSuspension=service.query(`/* member request wait after org suspension */ INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id)
   VALUES($1,$2,$3,$4,$5)`,[createCanonicalId('productMembership'),a.organizationId,orgFirst,member,actor]);
  void afterOrgSuspension.catch(()=>{});
  const observedOrgWait=await waited('member request wait after org suspension');
  await statusSql.query('COMMIT');
  expect(observedOrgWait).toBe(true);
  await expect(afterOrgSuspension).rejects.toThrow();
  await statusSql.query("UPDATE organizations SET status='active' WHERE id=$1",[a.organizationId]);
  const requestBeforeOrg=await nextInstance('request-before-org');
  await service.query('BEGIN');
  await insert(a.organizationId,requestBeforeOrg,member);
  const suspendAfterRequest=statusSql.query("/* org suspension wait after request */ UPDATE organizations SET status='suspended' WHERE id=$1",[a.organizationId]);
  const observedOrgAfterWait=await waited('org suspension wait after request');
  await service.query('COMMIT');await suspendAfterRequest;
  expect(observedOrgAfterWait).toBe(true);
  await statusSql.query("UPDATE organizations SET status='active' WHERE id=$1",[a.organizationId]);
  // Actor membership suspension has its own parent advisory lock. The target
  // member remains active, so these checks specifically test actor authority.
  const actorFirst=await nextInstance('actor-first');
  await admin.query('BEGIN');
  await admin.query("UPDATE memberships SET status='suspended' WHERE id=$1",[a.ownerMembershipId]);
  const afterActorSuspension=service.query(`/* member request wait after actor suspension */ INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id)
   VALUES($1,$2,$3,$4,$5)`,[createCanonicalId('productMembership'),a.organizationId,actorFirst,member,actor]);
  void afterActorSuspension.catch(()=>{});
  const observedActorWait=await waited('member request wait after actor suspension');
  await admin.query('COMMIT');
  expect(observedActorWait).toBe(true);
  await expect(afterActorSuspension).rejects.toThrow();
  await admin.query("UPDATE memberships SET status='active' WHERE id=$1",[a.ownerMembershipId]);
  const requestBeforeActor=await nextInstance('request-before-actor');
  await service.query('BEGIN');
  await insert(a.organizationId,requestBeforeActor,member);
  const suspendActorAfterRequest=admin.query("/* actor suspension wait after request */ UPDATE memberships SET status='suspended' WHERE id=$1",[a.ownerMembershipId]);
  const observedActorAfterWait=await waited('actor suspension wait after request');
  await service.query('COMMIT');await suspendActorAfterRequest;
  expect(observedActorAfterWait).toBe(true);
  expect((await admin.query("SELECT has_function_privilege('company_human_app','company_human_private.member_request_eligible(text,text,text)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
 }finally{
  await admin.query('ROLLBACK');await service.query('ROLLBACK');await statusSql.query('ROLLBACK');
  await service.end();await statusSql.end();
  for(const table of ['member_bootstrap_jobs','product_membership_commands','product_memberships','identity_audit_events','product_instances','memberships','role_permissions','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[[a.organizationId,b.organizationId]]);
  await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[[a.organizationId,b.organizationId]]);
  await admin.query('DELETE FROM products WHERE id=$1',[product]);
  await admin.query('DELETE FROM users WHERE id=ANY($1)',[[actor,target,otherActor]]);
  await admin.query(`DROP ROLE ${role}`);
  await admin.query(`REVOKE SELECT(id,status),UPDATE(status) ON organizations FROM ${statusRole}`);
  await admin.query(`REVOKE USAGE ON SCHEMA public FROM ${statusRole}`);
  await admin.query(`DROP ROLE ${statusRole}`);await observer.end();await admin.end();
 }
},60000);
