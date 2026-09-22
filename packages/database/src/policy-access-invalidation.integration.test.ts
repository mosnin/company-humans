import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { createCanonicalId } from '@company-human/contracts';
import { listMemberApplications } from './rls.js';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { requestProductMembership } from './product-memberships.js';
import { setProductEntitlement } from './product-entitlements.js';
import { setProductUsageLimit } from './product-usage-limits.js';
import { claimMemberDenial,finishMemberDenial } from './member-denial-worker.js';
const url=process.env.DATABASE_URL;
it.skipIf(!url)('policy revisions durably deny bound members, preserve bootstrap intent, and project only a current exact fenced receipt',async()=>{
 const db=new Client({connectionString:url});await db.connect();
 const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex');
 const serviceRole=`ch_policy_service_${suffix}`,workerRole=`ch_policy_worker_${suffix}`,appRole=`ch_policy_app_${suffix}`;
 for(const [role,parent] of [[serviceRole,'company_human_service'],[workerRole,'company_human_member_worker'],[appRole,'company_human_app']]){
  await db.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await db.query(`GRANT ${parent} TO ${role}`);
 }
 const service=new URL(url!);service.username=serviceRole;service.password=password;
 const worker=new URL(service);worker.username=workerRole;
 const runtime=new URL(service);runtime.username=appRole;
 const user=await syncAuthUser(url!,{authIssuer:'https://policy.test',authSubject:suffix,displayName:'Policy fixture',primaryEmail:null,status:'active',eventTimestamp:1});
 const org=await createOrganization(url!,{ownerUserId:user,name:'Policy fixture',slug:`policy-${suffix}`});
 const foreign=await createOrganization(url!,{ownerUserId:user,name:'Other policy fixture',slug:`policy-other-${suffix}`});
 const organizations=[org.organizationId,foreign.organizationId],product=createCanonicalId('product');
 const member=(await db.query('SELECT id FROM memberships WHERE organization_id=$1',[org.organizationId])).rows[0].id;
 const instance=createCanonicalId('productInstance');
 const metadata={schemaVersion:1,description:'Test only',category:'sales',supportedCapabilities:['lead-enrichment'],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:['enriched-leads'],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
 await db.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Policy fixture','ready',$3)",[product,`policy-${suffix}`,metadata]);
 await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'policy','connected','active',$1,$4)",[instance,org.organizationId,product,user]);
 const mapping=await requestProductMembership(service.toString(),{actorUserId:user,organizationId:org.organizationId,productInstanceId:instance,membershipId:member});
 const secondUser=await syncAuthUser(url!,{authIssuer:'https://policy.test',authSubject:`second-${suffix}`,displayName:'Pending fixture',primaryEmail:null,status:'active',eventTimestamp:1});
 const pendingMember=createCanonicalId('membership');
 await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'contributor','active')",[pendingMember,org.organizationId,secondUser]);
 const pending=await requestProductMembership(service.toString(),{actorUserId:user,organizationId:org.organizationId,productInstanceId:instance,membershipId:pendingMember});
 const catalog=(await db.query('SELECT catalog_metadata FROM products WHERE id=$1',[product])).rows[0].catalog_metadata;
 const capability=catalog.supportedCapabilities[0],meter=catalog.usageMeters[0];
 const entitlement=(effect:'allow'|'deny',expectedRevision:number,membershipId:string|null=null)=>setProductEntitlement(service.toString(),{actorUserId:user,organizationId:org.organizationId,productInstanceId:instance,membershipId,capability,effect,expectedRevision});
 const sql=new Client({connectionString:worker.toString()});await sql.connect();
 try{
  // Pending/unbound creation commands must remain claimable across policy setup.
  await entitlement('allow',0);
  expect((await db.query('SELECT desired_revision,policy_blocked FROM product_memberships WHERE id=$1',[pending])).rows[0]).toEqual({desired_revision:1,policy_blocked:false});
  await db.query("UPDATE product_memberships SET external_member_id='policy-member',provider_receipt_reference='fixture',provisioned_at=now(),provisioning_status='active' WHERE id=$1",[mapping]);
  await entitlement('deny',1);
  expect((await db.query('SELECT desired_enabled,desired_revision,access_revision,policy_blocked,provisioning_status FROM product_memberships WHERE id=$1',[mapping])).rows[0]).toEqual({desired_enabled:true,desired_revision:2,access_revision:'1',policy_blocked:true,provisioning_status:'active'});
  expect((await listMemberApplications(runtime.toString(),user,org.organizationId)).find(row=>row.id===mapping)?.status).toBe('access_update_pending');
  expect(await listMemberApplications(runtime.toString(),user,foreign.organizationId)).toEqual([]);
  const visibleStatus=async()=>(await listMemberApplications(runtime.toString(),user,org.organizationId)).find(row=>row.id===mapping)?.status;
  // Availability faults take precedence over the pending policy denial.
  for(const state of ['failed','removed']){
   await db.query('UPDATE product_memberships SET provisioning_status=$2 WHERE id=$1',[mapping,state]);
   expect(await visibleStatus()).toBe('unavailable');
  }
  await db.query("UPDATE product_memberships SET provisioning_status='active' WHERE id=$1",[mapping]);
  await db.query("UPDATE products SET catalog_status='retired' WHERE id=$1",[product]);
  expect(await visibleStatus()).toBe('unavailable');
  await db.query("UPDATE products SET catalog_status='ready' WHERE id=$1",[product]);
  expect(await visibleStatus()).toBe('access_update_pending');
  // Plain disable intent has the same honest pending state without provider confirmation.
  await db.query('UPDATE product_memberships SET policy_blocked=false,desired_enabled=false WHERE id=$1',[mapping]);
  expect(await visibleStatus()).toBe('access_update_pending');
  await db.query('UPDATE product_memberships SET desired_enabled=true WHERE id=$1',[mapping]);
  await db.query('UPDATE product_instances SET desired_enabled=false WHERE id=$1',[instance]);
  expect(await visibleStatus()).toBe('access_update_pending');
  await db.query('UPDATE product_instances SET desired_enabled=true WHERE id=$1',[instance]);
  await db.query('UPDATE product_memberships SET policy_blocked=true WHERE id=$1',[mapping]);

  const command=(await db.query('SELECT * FROM product_membership_commands WHERE product_membership_id=$1 AND source_policy IS NOT NULL',[mapping])).rows[0];
  expect(command).toMatchObject({actor_user_id:user,actor_service_id:null,operation:'suspendMember',source_policy:{kind:'entitlement',revision:2}});
  expect((await db.query("SELECT after_state FROM identity_audit_events WHERE target_id=$1 AND action='product.policy.access_blocked'",[mapping])).rows[0].after_state.sourcePolicy).toEqual(command.source_policy);
  expect(await claimMemberDenial(worker.toString(),foreign.organizationId,product,true)).toBeNull();
  const old=(await claimMemberDenial(worker.toString(),org.organizationId,product,true))!;
  expect(old.accessCommand).toMatchObject({access:'suspended',accessRevision:1});
  // A new limit revision supersedes the outstanding policy denial in the SAME access stream.
  await setProductUsageLimit(service.toString(),{actorUserId:user,organizationId:org.organizationId,productInstanceId:instance,membershipId:null,meterKey:meter,unit:'credits',window:'utc_month',maximumQuantity:'100.000001',expectedRevision:0});
  const latest=(await claimMemberDenial(worker.toString(),org.organizationId,product,true))!;
  expect(latest.accessCommand?.accessRevision).toBe(2);
  const compact={status:'succeeded' as const,value:{externalMemberId:'policy-member',status:'suspended' as const}};
  await finishMemberDenial(worker.toString(),org.organizationId,old,compact,old.accessCommand);
  expect((await db.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[old.commandId])).rows[0].status).toBe('superseded');
  expect((await db.query('SELECT provisioning_status FROM product_memberships WHERE id=$1',[mapping])).rows[0].provisioning_status).toBe('active');
  // Receipt matching is enforced in the restricted projection, including access revision.
  await expect(finishMemberDenial(worker.toString(),org.organizationId,latest,compact,{...latest.accessCommand!,accessRevision:99})).rejects.toThrow('Exact fenced denial receipt required');
  expect((await db.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[latest.commandId])).rows[0].status).toBe('running');
  const projectionGuard=`projection_audit_failure_${suffix}`;
  await db.query(`CREATE FUNCTION public.${projectionGuard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${latest.commandId}' AND NEW.action='product.member_denial.projected' THEN RAISE EXCEPTION 'fixture projection audit failure'; END IF; RETURN NEW; END $$`);
  await db.query(`CREATE TRIGGER ${projectionGuard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${projectionGuard}()`);
  try{await expect(finishMemberDenial(worker.toString(),org.organizationId,latest,compact,latest.accessCommand)).rejects.toThrow('fixture projection audit failure');}
  finally{await db.query(`DROP TRIGGER ${projectionGuard} ON identity_audit_events`);await db.query(`DROP FUNCTION public.${projectionGuard}()`);}
  expect((await db.query('SELECT provisioning_status FROM product_memberships WHERE id=$1',[mapping])).rows[0].provisioning_status).toBe('active');
  expect((await db.query('SELECT * FROM member_denial_access_receipts WHERE command_id=$1',[latest.commandId])).rowCount).toBe(0);
  await finishMemberDenial(worker.toString(),org.organizationId,latest,compact,latest.accessCommand);
  expect((await db.query('SELECT desired_enabled,policy_blocked,provisioning_status FROM product_memberships WHERE id=$1',[mapping])).rows[0]).toEqual({desired_enabled:true,policy_blocked:true,provisioning_status:'suspended'});
  expect((await listMemberApplications(runtime.toString(),user,org.organizationId)).find(row=>row.id===mapping)?.status).toBe('suspended');
  expect((await db.query('SELECT receipt FROM member_denial_access_receipts WHERE command_id=$1',[latest.commandId])).rows[0].receipt).toEqual(latest.accessCommand);
  await sql.query("SELECT set_config('company_human.organization_id',$1,false)",[foreign.organizationId]);
  expect((await sql.query('SELECT * FROM member_denial_access_receipts WHERE command_id=$1',[latest.commandId])).rowCount).toBe(0);
  await expect(sql.query("SELECT company_human_private.project_fenced_member_denial($1,$2,$3)",[latest.commandId,latest.leaseToken,JSON.stringify(latest.accessCommand)])).rejects.toThrow('Stale member denial projection lease');
  await expect(sql.query('UPDATE product_memberships SET policy_blocked=false WHERE id=$1',[mapping])).rejects.toThrow('permission denied');
  for(const role of ['company_human_app','company_human_service','company_human_identity'])expect((await db.query("SELECT has_function_privilege($1,'company_human_private.project_fenced_member_denial(text,uuid,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  // Member-specific policy touches its target only, not another assignment.
  await entitlement('deny',0,pendingMember);
  expect((await db.query('SELECT access_revision FROM product_memberships WHERE id=$1',[mapping])).rows[0].access_revision).toBe('2');
  expect((await db.query('SELECT desired_revision,policy_blocked FROM product_memberships WHERE id=$1',[pending])).rows[0]).toEqual({desired_revision:1,policy_blocked:false});
  // Audit failure rolls back policy history, block revision, access journal and job together.
  const guard=`policy_audit_failure_${suffix}`;
  await db.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${mapping}' AND NEW.action='product.policy.access_blocked' THEN RAISE EXCEPTION 'fixture policy audit failure'; END IF; RETURN NEW; END $$`);
  await db.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
  try{await expect(entitlement('allow',2)).rejects.toThrow('fixture policy audit failure');}
  finally{await db.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await db.query(`DROP FUNCTION public.${guard}()`);}
  expect((await db.query('SELECT desired_revision,access_revision FROM product_memberships WHERE id=$1',[mapping])).rows[0]).toEqual({desired_revision:3,access_revision:'2'});
  expect((await db.query('SELECT max(revision) revision FROM entitlement_policy_revisions WHERE entitlement_id=$1',[command.source_policy.id])).rows[0].revision).toBe(2);
  // A compact legacy receipt cannot turn a policy invalidation into provider confirmation.
  await entitlement('allow',2);
  const missing=(await claimMemberDenial(worker.toString(),org.organizationId,product,true))!;
  await finishMemberDenial(worker.toString(),org.organizationId,missing,compact);
  expect((await db.query('SELECT status,failure_code FROM member_denial_jobs WHERE command_id=$1',[missing.commandId])).rows[0]).toEqual({status:'failed',failure_code:'fenced_policy_receipt_required'});
  // Concurrent policy writers serialize their revisions on the mapping, without lost intent.
  await Promise.all([entitlement('deny',3),setProductUsageLimit(service.toString(),{actorUserId:user,organizationId:org.organizationId,productInstanceId:instance,membershipId:null,meterKey:meter,unit:'credits',window:'utc_month',maximumQuantity:'0',expectedRevision:1})]);
  expect((await db.query('SELECT desired_enabled,desired_revision,access_revision FROM product_memberships WHERE id=$1',[mapping])).rows[0]).toEqual({desired_enabled:true,desired_revision:6,access_revision:'5'});
  await db.query("UPDATE product_memberships SET external_member_id='second-policy-member',provisioning_status='suspended' WHERE id=$1",[pending]);
  await entitlement('allow',1,pendingMember);
  expect((await db.query('SELECT access_revision FROM product_memberships WHERE id=$1',[mapping])).rows[0].access_revision).toBe('5');
  expect((await db.query('SELECT desired_revision,policy_blocked FROM product_memberships WHERE id=$1',[pending])).rows[0]).toEqual({desired_revision:2,policy_blocked:true});
  // Even an otherwise-authorized product-disable command cannot forge policy provenance.
  await db.query('UPDATE product_instances SET desired_enabled=false WHERE id=$1',[instance]);
  await db.query('UPDATE product_memberships SET desired_enabled=false,desired_revision=7 WHERE id=$1',[mapping]);
  const appService=new Client({connectionString:service.toString()});await appService.connect();
  try{
   await appService.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[user,org.organizationId]);
   const forged=createCanonicalId('provisioningOperation');
   await expect(appService.query("INSERT INTO product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id,source_policy) VALUES($1,$2,$3,7,'suspendMember',$1,$4,$5)",[forged,org.organizationId,mapping,user,command.source_policy])).rejects.toThrow('row-level security');
   // The ordinary authorized denial without a forged source remains compatible.
   await appService.query("INSERT INTO product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id) VALUES($1,$2,$3,7,'suspendMember',$1,$4)",[forged,org.organizationId,mapping,user]);
  }finally{await appService.end();}
 }finally{
  await sql.end();
  for(const table of ['identity_audit_events','member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','member_bootstrap_attempts','member_bootstrap_jobs','usage_limit_attempts','usage_limit_jobs','product_usage_limit_revisions','product_usage_limits','entitlement_policy_revisions','entitlement_policies','product_membership_commands','product_memberships','product_instances','memberships','role_permissions','roles'])await db.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[organizations]);
  await db.query('DELETE FROM organizations WHERE id=ANY($1)',[organizations]);await db.query('DELETE FROM products WHERE id=$1',[product]);await db.query('DELETE FROM users WHERE id=ANY($1)',[[user,secondUser]]);
  for(const role of [serviceRole,workerRole,appRole]){await db.query(`DROP OWNED BY ${role}`);await db.query(`DROP ROLE ${role}`);}
  await db.end();
 }
},30000);
