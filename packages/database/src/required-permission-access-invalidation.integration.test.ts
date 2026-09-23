import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { createCanonicalId,type Capability,type UserId } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { requestProductMembership } from './product-memberships.js';
import { setRolePermissions } from './role-permissions.js';
import { changeMembershipRole } from './organization-authority.js';
import { claimMemberBootstrap,finishMemberBootstrap } from './member-bootstrap-worker.js';
import { claimMemberDenial,finishMemberDenial } from './member-denial-worker.js';

const url=process.env.DATABASE_URL;
const suspended=(id:string)=>({status:'succeeded' as const,value:{externalMemberId:id,status:'suspended' as const}});
it.skipIf(!url)('invalidates every missing catalog permission with fenced, tenant-specific denials including late binds',async()=>{
 const admin=new Client({connectionString:url});await admin.connect();
 const observer=new Client({connectionString:url});await observer.connect();
 const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex');
 const serviceRole=`ch_required_service_${suffix}`,bootstrapRole=`ch_required_boot_${suffix}`,denialRole=`ch_required_denial_${suffix}`;
 for(const [role,parent] of [[serviceRole,'company_human_service'],[bootstrapRole,'company_human_bootstrap_worker'],[denialRole,'company_human_member_worker']]){
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT ${parent} TO ${role}`);
 }
 const endpoint=(role:string)=>{const connection=new URL(url!);connection.username=role;connection.password=password;return connection.toString();};
 const service=endpoint(serviceRole),bootstrap=endpoint(bootstrapRole),denial=endpoint(denialRole);
 const users:UserId[]=[];
 for(let n=0;n<6;n++)users.push(await syncAuthUser(url!,{authIssuer:'https://required-permission.test',authSubject:`${suffix}-${n}`,displayName:'Fixture',primaryEmail:null,status:'active',eventTimestamp:1}));
 const a=await createOrganization(url!,{ownerUserId:users[0]!,name:'A',slug:`required-a-${suffix}`});
 const b=await createOrganization(url!,{ownerUserId:users[0]!,name:'B',slug:`required-b-${suffix}`});
 const orgs=[a.organizationId,b.organizationId];
 const roles=await admin.query("SELECT organization_id,id,key FROM roles WHERE organization_id=ANY($1)",[orgs]);
 const role=(org:string,key:string)=>roles.rows.find(row=>row.organization_id===org&&row.key===key)!.id as string;
 const contributorA=role(orgs[0]!,'contributor'),contributorB=role(orgs[1]!,'contributor');
 const grants=async(roleId:string)=>(await admin.query<{permission_key:Capability}>('SELECT permission_key FROM role_permissions WHERE role_id=$1 ORDER BY permission_key',[roleId])).rows.map(r=>r.permission_key);
 const set=async(roleId:string,next:Capability[],org=orgs[0]!)=>setRolePermissions(service,{actorUserId:users[0]!,organizationId:org,roleId,capabilities:next,expectedCapabilities:await grants(roleId)});
 const memberA=createCanonicalId('membership'),memberB=createCanonicalId('membership'),moveMember=createCanonicalId('membership'),pendingMember=createCanonicalId('membership'),roleMember=createCanonicalId('membership'),legacyMember=createCanonicalId('membership');
 const members=[[memberA,orgs[0],users[1]],[memberB,orgs[1],users[1]],[moveMember,orgs[0],users[2]],[pendingMember,orgs[0],users[3]],[roleMember,orgs[0],users[4]],[legacyMember,orgs[0],users[5]]] as const;
 const pRequired=createCanonicalId('product'),pSimple=createCanonicalId('product');
 const productIds=[pRequired,pSimple];
 const metadata={schemaVersion:1,description:'Fixture',category:'sales',supportedCapabilities:[],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:[],requiredPermissions:['product.use','billing.read.all'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:[]};
 const instances=new Map<string,string>();
 const instance=(org:string,product:string)=>instances.get(`${org}:${product}`)!;
 const mappingIds:string[]=[];
 const mapping=async(org:string,product:string,member:string)=>{
  const id=await requestProductMembership(service,{actorUserId:users[0]!,organizationId:org,productInstanceId:instance(org,product),membershipId:member});mappingIds.push(id);return id;
 };
 const state=async(id:string)=>(await admin.query('SELECT desired_enabled,policy_blocked,desired_revision,access_revision,external_member_id,provisioning_status FROM product_memberships WHERE id=$1',[id])).rows[0];
 const authorizations=async(id:string)=>(await admin.query('SELECT * FROM product_membership_commands WHERE product_membership_id=$1 AND source_authorization IS NOT NULL ORDER BY desired_revision',[id])).rows;
 const claimDenial=async()=>{for(let n=0;n<12;n++){const lease=await claimMemberDenial(denial,orgs[0]!,pRequired,true);if(lease)return lease;}throw new Error('Expected current fenced denial');};
 const historical=async()=>{await admin.query('BEGIN');try{await admin.query('SET LOCAL ROLE company_human_policy_denial');const result=await admin.query('SELECT company_human_private.reconcile_unauthorized_product_memberships() n');await admin.query('COMMIT');return result.rows[0].n as number;}catch(error){await admin.query('ROLLBACK');throw error;}};
 const missingPermission=async(org:string,roleId:string,product:string)=>{
  await admin.query('BEGIN');
  try{
   await admin.query('SET LOCAL ROLE company_human_member_binding');
   const result=await admin.query<{missing:string|null}>('SELECT company_human_private.missing_product_permission($1,$2,$3) missing',[org,roleId,product]);
   await admin.query('COMMIT');return result.rows[0]?.missing;
  }catch(error){await admin.query('ROLLBACK');throw error;}
 };
 try{
  for(const [id,org,user] of members)await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')",[id,org,user]);
  for(const org of orgs){const targetRole=org===orgs[0]?contributorA:contributorB;await set(targetRole,[...await grants(targetRole),'billing.read.all'],org);}
  for(const [id,key,meta] of [[pRequired,`required-${suffix}`,metadata],[pSimple,`simple-${suffix}`,{...metadata,requiredPermissions:['product.use']}]] as const)
   await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[id,key,meta]);
  for(const org of orgs)for(const product of productIds){const id=createCanonicalId('productInstance');instances.set(`${org}:${product}`,id);
   await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'main','connected','active',$2,$4)",[id,org,product,users[0]]);}
  const targeted=await mapping(orgs[0]!,pRequired,memberA);
  const simple=await mapping(orgs[0]!,pSimple,memberA);
  const foreign=await mapping(orgs[1]!,pRequired,memberB);
  const move=await mapping(orgs[0]!,pRequired,moveMember);
  const pending=await mapping(orgs[0]!,pRequired,pendingMember);
  await admin.query("UPDATE product_memberships SET external_member_id=id,provider_receipt_reference='fixture',provisioned_at=now(),provisioning_status='active' WHERE id=ANY($1)",[[targeted,simple,foreign,move]]);
  // Only the product requiring the removed permission in this organization is denied.
  await set(contributorA,(await grants(contributorA)).filter(key=>key!=='billing.read.all'));
  for(const id of [targeted,move]){
   expect(await state(id)).toMatchObject({desired_enabled:true,policy_blocked:true,desired_revision:2,access_revision:'1'});
   expect(await authorizations(id)).toHaveLength(1);
   expect((await authorizations(id))[0].source_authorization).toMatchObject({permission:'billing.read.all',roleId:contributorA,productId:pRequired});
   expect((await admin.query("SELECT count(*)::int n FROM identity_audit_events WHERE target_id=$1 AND action='product.authorization.access_blocked'",[id])).rows[0].n).toBe(1);
  }
  for(const id of [simple,foreign,pending])expect(await state(id)).toMatchObject({policy_blocked:false,desired_revision:1,access_revision:'0'});
  await set(contributorA,[...await grants(contributorA),'billing.read.all']);
  expect(await state(targeted)).toMatchObject({policy_blocked:true,desired_revision:2,access_revision:'1'});
  await set(contributorA,(await grants(contributorA)).filter(key=>key!=='billing.read.all'));
  const first=await claimDenial();
  await finishMemberDenial(denial,orgs[0]!,first,suspended(first.accessCommand!.target.externalMemberId!),first.accessCommand);
  expect((await admin.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[first.commandId])).rows[0].status).toBe('succeeded');
  const second=await claimDenial();
  await finishMemberDenial(denial,orgs[0]!,second,suspended(second.accessCommand!.target.externalMemberId!));
  expect((await admin.query('SELECT failure_code FROM member_denial_jobs WHERE command_id=$1',[second.commandId])).rows[0].failure_code).toBe('fenced_policy_receipt_required');
  // Provider identity created before permission loss is retained and denied in
  // the same binding transaction after its provision receipt arrives.
  await set(contributorA,[...await grants(contributorA),'billing.read.all']);
  let lease=await claimMemberBootstrap(bootstrap,orgs[0]!,pRequired);
  for(let n=0;n<8&&lease?.membershipId!==pendingMember;n++)lease=await claimMemberBootstrap(bootstrap,orgs[0]!,pRequired);
  expect(lease?.membershipId).toBe(pendingMember);
  await admin.query('BEGIN');
  await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='billing.read.all'",[orgs[0],contributorA]);
  const bind=finishMemberBootstrap(bootstrap,orgs[0]!,lease!,suspended(pending));
  const waiting=await new Promise<boolean>(async resolve=>{for(let i=0;i<100;i++){
   const rows=await observer.query("SELECT query,wait_event_type FROM pg_stat_activity WHERE datname=current_database() AND state='active'");
   if(rows.rows.some(r=>r.wait_event_type==='Lock'&&String(r.query).includes('bind_suspended_product_member'))){resolve(true);return;}
   await new Promise(done=>setTimeout(done,10));}resolve(false);});
  await admin.query('COMMIT');await bind;expect(waiting).toBe(true);
  expect(await state(pending)).toMatchObject({policy_blocked:true,desired_revision:2,access_revision:'1',external_member_id:pending,provisioning_status:'suspended'});
  expect(await authorizations(pending)).toHaveLength(1);
  expect((await authorizations(pending))[0].source_authorization).toMatchObject({reason:'missing_permission_at_provider_binding',permission:'billing.read.all'});
  // An audit failure must roll back reassignment and its mapping, command and access revision.
  const manager=role(orgs[0]!,'manager');
  await set(contributorA,[...await grants(contributorA),'billing.read.all']);
  const extra=await mapping(orgs[0]!,pRequired,roleMember);
  await admin.query("UPDATE product_memberships SET external_member_id=id,provider_receipt_reference='fixture',provisioned_at=now(),provisioning_status='active' WHERE id=$1",[extra]);
  const before=await state(extra);
  const guard=`required_auth_audit_${suffix}`;
  await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${extra}' AND NEW.action='product.authorization.access_blocked' THEN RAISE EXCEPTION 'required permission audit failure'; END IF; RETURN NEW; END $$`);
  await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
  try{await expect(changeMembershipRole(service,{actorUserId:users[0]!,organizationId:orgs[0]!,membershipId:roleMember,roleKey:'manager'})).rejects.toThrow('required permission audit failure');}
  finally{await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await admin.query(`DROP FUNCTION public.${guard}()`);}
  expect(await state(extra)).toEqual(before);
  expect((await admin.query('SELECT role_key FROM memberships WHERE id=$1',[roleMember])).rows[0].role_key).toBe('contributor');
  await changeMembershipRole(service,{actorUserId:users[0]!,organizationId:orgs[0]!,membershipId:roleMember,roleKey:'manager'});
  expect(await state(extra)).toMatchObject({policy_blocked:true,desired_revision:2,access_revision:'1'});
  expect((await authorizations(extra))[0].source_authorization).toMatchObject({kind:'membership_role',permission:'billing.read.all',roleId:manager});
  // Historical rows from before this trigger are repaired once, with no role mutation.
  const legacy=await mapping(orgs[0]!,pRequired,legacyMember);
  await changeMembershipRole(service,{actorUserId:users[0]!,organizationId:orgs[0]!,membershipId:legacyMember,roleKey:'manager'});
  await admin.query("UPDATE product_memberships SET external_member_id=id,provider_receipt_reference='legacy',provisioned_at=now(),provisioning_status='active' WHERE id=$1",[legacy]);
  expect(await historical()).toBe(1);expect(await historical()).toBe(0);
  expect(await authorizations(legacy)).toHaveLength(1);
  expect((await authorizations(legacy))[0].source_authorization).toMatchObject({reason:'preexisting_authorization_gap',permission:'billing.read.all'});
  const movedGrantProduct=createCanonicalId('product');productIds.push(movedGrantProduct);
  await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Moved grant','ready',$3)",[movedGrantProduct,`moved-grant-${suffix}`,metadata]);
  const movedGrantInstance=createCanonicalId('productInstance');
  await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'moved','connected','active',$2,$4)",[movedGrantInstance,orgs[0],movedGrantProduct,users[0]]);
  const movedGrantMapping=await requestProductMembership(service,{actorUserId:users[0]!,organizationId:orgs[0]!,productInstanceId:movedGrantInstance,membershipId:memberA});
  await admin.query("UPDATE product_memberships SET external_member_id=id,provider_receipt_reference='fixture',provisioned_at=now(),provisioning_status='active' WHERE id=$1",[movedGrantMapping]);
  await admin.query("UPDATE role_permissions SET organization_id=$1,role_id=$2 WHERE organization_id=$3 AND role_id=$4 AND permission_key='billing.read.all'",[orgs[1],role(orgs[1]!,'manager'),orgs[0],contributorA]);
  expect(await state(movedGrantMapping)).toMatchObject({policy_blocked:true,desired_revision:2,access_revision:'1'});
  expect((await authorizations(movedGrantMapping))[0].source_authorization).toMatchObject({permission:'billing.read.all',roleId:contributorA});
  expect(await state(foreign)).toMatchObject({policy_blocked:false,desired_revision:1,access_revision:'0'});
  await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'billing.read.all')",[orgs[0],contributorA]);
  const multi=createCanonicalId('product');productIds.push(multi);
  await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Multi','ready',$3)",[multi,`multi-${suffix}`,{...metadata,requiredPermissions:['product.use','billing.read.all','crm.read.own']}]);
  const multiInstance=createCanonicalId('productInstance');
  await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'multi','connected','active',$2,$4)",[multiInstance,orgs[0],multi,users[0]]);
  const multiMapping=await requestProductMembership(service,{actorUserId:users[0]!,organizationId:orgs[0]!,productInstanceId:multiInstance,membershipId:memberA});
  await admin.query("UPDATE product_memberships SET external_member_id=id,provider_receipt_reference='fixture',provisioned_at=now(),provisioning_status='active' WHERE id=$1",[multiMapping]);
  await set(contributorA,(await grants(contributorA)).filter(key=>!['billing.read.all','crm.read.own'].includes(key)));
  expect(await authorizations(multiMapping)).toHaveLength(1);
  expect((await admin.query("SELECT count(*)::int n FROM identity_audit_events WHERE target_id=$1 AND action='product.authorization.access_blocked'",[multiMapping])).rows[0].n).toBe(1);
  expect(await missingPermission(orgs[0]!,manager,pRequired)).toBe('billing.read.all');
  const malformed=createCanonicalId('product');productIds.push(malformed);
  await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Invalid','ready',$3)",[malformed,`invalid-${suffix}`,{...metadata,requiredPermissions:['unknown.permission']}]);
  expect(await missingPermission(orgs[0]!,contributorA,malformed)).toBe('catalog.invalid');
  const malformedInstance=createCanonicalId('productInstance');
  await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'invalid','connected','active',$2,$4)",[malformedInstance,orgs[0],malformed,users[0]]);
  // Model a bound historical row predating request-time catalog validation.
  // A current service request for this malformed catalog must fail closed.
  await expect(requestProductMembership(service,{actorUserId:users[0]!,organizationId:orgs[0]!,productInstanceId:malformedInstance,membershipId:legacyMember})).rejects.toThrow('unavailable');
  const malformedMapping=createCanonicalId('productMembership');
  await admin.query(`INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id,
    external_member_id,provider_receipt_reference,provisioned_at,provisioning_status)
    VALUES($1,$2,$3,$4,$5,$1,'legacy',now(),'active')`,[malformedMapping,orgs[0],malformedInstance,legacyMember,users[0]]);
  expect(await historical()).toBe(1);
  expect((await authorizations(malformedMapping))[0].source_authorization).toMatchObject({reason:'preexisting_authorization_gap',permission:'catalog.invalid'});
  const nonArray=createCanonicalId('product');productIds.push(nonArray);
  await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Malformed','ready',$3)",[nonArray,`nonarray-${suffix}`,{...metadata,requiredPermissions:'product.use'}]);
  expect(await missingPermission(orgs[0]!,contributorA,nonArray)).toBe('catalog.invalid');
  expect(await historical()).toBe(0);
  for(const runtimeRole of ['company_human_service','company_human_app','company_human_bootstrap_worker']){
   expect((await admin.query("SELECT has_function_privilege($1,'company_human_private.block_missing_authorization_binding(text,text)','EXECUTE') allowed",[runtimeRole])).rows[0].allowed).toBe(false);
   expect((await admin.query("SELECT has_function_privilege($1,'company_human_private.reconcile_unauthorized_product_memberships()','EXECUTE') allowed",[runtimeRole])).rows[0].allowed).toBe(false);
  }
 }finally{
  await admin.query('ROLLBACK');
  for(const table of ['identity_audit_events','member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','member_bootstrap_attempts','member_bootstrap_jobs','product_membership_commands','product_memberships','product_instances','memberships','role_permissions','roles'])
   await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
  await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await admin.query('DELETE FROM products WHERE id=ANY($1)',[productIds]);await admin.query('DELETE FROM users WHERE id=ANY($1)',[users]);
  for(const roleName of [serviceRole,bootstrapRole,denialRole])await admin.query(`DROP ROLE ${roleName}`);
  await observer.end();await admin.end();
 }
},60000);
