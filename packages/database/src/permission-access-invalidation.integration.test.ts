import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { expect,it } from 'vitest';
import { createCanonicalId,type Capability,type UserId } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { requestProductMembership } from './product-memberships.js';
import { setRolePermissions } from './role-permissions.js';
import { changeMembershipRole } from './organization-authority.js';
import { claimMemberDenial,finishMemberDenial } from './member-denial-worker.js';
const url=process.env.DATABASE_URL;
it.skipIf(!url)('permission loss atomically journals denial, serializes role races, and requires fenced receipts',async()=>{
 const db=new Client({connectionString:url});await db.connect();
 const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex');
 const serviceRole=`ch_permission_service_${suffix}`,workerRole=`ch_permission_worker_${suffix}`;
 for(const [role,parent] of [[serviceRole,'company_human_service'],[workerRole,'company_human_member_worker']]){
  await db.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await db.query(`GRANT ${parent} TO ${role}`);
 }
 const service=new URL(url!);service.username=serviceRole;service.password=password;
 const worker=new URL(service);worker.username=workerRole;
 const users:UserId[]=[];
 for(let i=0;i<3;i++)users.push(await syncAuthUser(url!,{authIssuer:'https://permission.test',authSubject:`${suffix}-${i}`,displayName:'Permission fixture',primaryEmail:null,status:'active',eventTimestamp:1}));
 const org=await createOrganization(url!,{ownerUserId:users[0]!,name:'Permission fixture',slug:`permission-${suffix}`});
 const foreign=await createOrganization(url!,{ownerUserId:users[0]!,name:'Other permission fixture',slug:`permission-other-${suffix}`});
 const organizations=[org.organizationId,foreign.organizationId],product=createCanonicalId('product');
 const member=createCanonicalId('membership'),foreignMember=createCanonicalId('membership'),pendingMember=createCanonicalId('membership');
 for(const [id,organization,user] of [[member,org.organizationId,users[1]],[foreignMember,foreign.organizationId,users[1]],[pendingMember,org.organizationId,users[2]]])await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'contributor','active')",[id,organization,user]);
 const metadata={schemaVersion:1,description:'Test only',category:'sales',supportedCapabilities:[],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:[],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
 await db.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Permission fixture','ready',$3)",[product,`permission-${suffix}`,metadata]);
 const instances=[];
 for(const organization of organizations){const instance=createCanonicalId('productInstance');instances.push(instance);await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'permission','connected','active',$1,$4)",[instance,organization,product,users[0]]);}
 const mapping=await requestProductMembership(service.toString(),{actorUserId:users[0]!,organizationId:org.organizationId,productInstanceId:instances[0]!,membershipId:member});
 const other=await requestProductMembership(service.toString(),{actorUserId:users[0]!,organizationId:foreign.organizationId,productInstanceId:instances[1]!,membershipId:foreignMember});
 const pending=await requestProductMembership(service.toString(),{actorUserId:users[0]!,organizationId:org.organizationId,productInstanceId:instances[0]!,membershipId:pendingMember});
 const role=(await db.query("SELECT id FROM roles WHERE organization_id=$1 AND key='contributor'",[org.organizationId])).rows[0].id;
 const manager=(await db.query("SELECT id FROM roles WHERE organization_id=$1 AND key='manager'",[org.organizationId])).rows[0].id;
 const grants=async(roleId:string)=>(await db.query<{permission_key:Capability}>('SELECT permission_key FROM role_permissions WHERE role_id=$1 ORDER BY permission_key',[roleId])).rows.map(row=>row.permission_key);
 const set=async(roleId:string,next:Capability[])=>setRolePermissions(service.toString(),{actorUserId:users[0]!,organizationId:org.organizationId,roleId,capabilities:next,expectedCapabilities:await grants(roleId)});
 const count=async()=>(await db.query('SELECT count(*)::int n FROM product_membership_commands WHERE product_membership_id=$1 AND source_authorization IS NOT NULL',[mapping])).rows[0].n;
 const state=async()=>(await db.query('SELECT desired_enabled,policy_blocked,desired_revision,access_revision,provisioning_status FROM product_memberships WHERE id=$1',[mapping])).rows[0];
 const claim=async()=>{for(let i=0;i<20;i++){const lease=await claimMemberDenial(worker.toString(),org.organizationId,product,true);if(lease)return lease;}throw new Error('No claimable denial');};
 const reconcile=async()=>{await db.query('BEGIN');try{await db.query('SET LOCAL ROLE company_human_policy_denial');await db.query('SELECT company_human_private.reconcile_unauthorized_product_memberships()');await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}};
 const sql=new Client({connectionString:service.toString()});await sql.connect();
 try{
  await db.query("UPDATE product_memberships SET external_member_id=id,provider_receipt_reference='fixture',provisioned_at=now(),provisioning_status='active' WHERE id=ANY($1)",[[mapping,other]]);
  await set(role,(await grants(role)).filter(key=>key!=='crm.read.own'));
  expect(await count()).toBe(0);
  const original=await grants(role);
  await set(role,original.filter(key=>key!=='product.use'));
  expect(await count()).toBe(1);
  expect(await state()).toMatchObject({desired_enabled:true,policy_blocked:true,desired_revision:2,access_revision:'1',provisioning_status:'active'});
  expect((await db.query('SELECT policy_blocked,desired_revision FROM product_memberships WHERE id=ANY($1) ORDER BY id',[[other,pending]])).rows).toEqual([{policy_blocked:false,desired_revision:1},{policy_blocked:false,desired_revision:1}]);
  const command=(await db.query('SELECT * FROM product_membership_commands WHERE product_membership_id=$1 AND source_authorization IS NOT NULL',[mapping])).rows[0];
  expect(command.source_authorization).toMatchObject({kind:'role_permission',permission:'product.use',roleId:role,membershipId:member,initiatedByUserId:users[0]});
  expect(command.actor_service_id).toBe('authorization-revocation');
  expect((await db.query('SELECT * FROM member_denial_jobs WHERE command_id=$1',[command.id])).rowCount).toBe(1);
  expect((await db.query("SELECT * FROM identity_audit_events WHERE target_id=$1 AND action='product.authorization.access_blocked'",[mapping])).rowCount).toBe(1);
  await set(role,original);expect(await count()).toBe(1);expect((await state()).policy_blocked).toBe(true);
  // Assignment to a permitting role changes no remote access. Removing its grant does.
  await changeMembershipRole(service.toString(),{actorUserId:users[0]!,organizationId:org.organizationId,membershipId:member,roleKey:'manager'});
  expect(await count()).toBe(1);
  const managerGrants=await grants(manager);
  await set(manager,managerGrants.filter(key=>key!=='product.use'));
  const old=await claim();expect(old?.accessCommand).toBeDefined();
  // Move out and back into a denying role: new denial supersedes the outstanding one.
  await changeMembershipRole(service.toString(),{actorUserId:users[0]!,organizationId:org.organizationId,membershipId:member,roleKey:'contributor'});
  await changeMembershipRole(service.toString(),{actorUserId:users[0]!,organizationId:org.organizationId,membershipId:member,roleKey:'manager'});
  const compact={status:'succeeded' as const,value:{externalMemberId:mapping,status:'suspended' as const}};
  await finishMemberDenial(worker.toString(),org.organizationId,old!,compact,old!.accessCommand);
  expect((await db.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[old!.commandId])).rows[0].status).toBe('superseded');
  const latest=await claim();expect(latest?.accessCommand).toBeDefined();
  await finishMemberDenial(worker.toString(),org.organizationId,latest!,compact);
  expect((await db.query('SELECT status,failure_code FROM member_denial_jobs WHERE command_id=$1',[latest!.commandId])).rows[0]).toEqual({status:'failed',failure_code:'fenced_policy_receipt_required'});
  await set(manager,managerGrants);await set(manager,managerGrants.filter(key=>key!=='product.use'));
  const exact=await claim();expect(exact?.accessCommand).toBeDefined();
  await finishMemberDenial(worker.toString(),org.organizationId,exact!,compact,exact!.accessCommand);
  expect((await state()).provisioning_status).toBe('suspended');
  expect((await db.query('SELECT receipt FROM member_denial_access_receipts WHERE command_id=$1',[exact!.commandId])).rows[0].receipt).toEqual(exact!.accessCommand);
  // Failure to persist audit rolls back permission, command, mapping revision and delivery job.
  await set(manager,managerGrants);const before=await state(),beforeCount=await count();
  const guard=`authorization_audit_failure_${suffix}`;
  await db.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${mapping}' AND NEW.action='product.authorization.access_blocked' THEN RAISE EXCEPTION 'fixture authorization audit failure'; END IF; RETURN NEW; END $$`);
  await db.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
  try{await expect(set(manager,managerGrants.filter(key=>key!=='product.use'))).rejects.toThrow('fixture authorization audit failure');}
  finally{await db.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await db.query(`DROP FUNCTION public.${guard}()`);}
  expect(await grants(manager)).toContain('product.use');expect(await state()).toEqual(before);expect(await count()).toBe(beforeCount);
  // Both interleavings are real transactions; wait until PostgreSQL reports the blocked lock.
  for(const assignmentFirst of [true,false]){
   await set(manager,managerGrants);
   await changeMembershipRole(service.toString(),{actorUserId:users[0]!,organizationId:org.organizationId,membershipId:member,roleKey:'contributor'});
   const a=new Client({connectionString:service.toString()}),b=new Client({connectionString:service.toString()});await a.connect();await b.connect();
   const beforeRace=await count();
   try{
    for(const c of [a,b]){await c.query('BEGIN');await c.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",[users[0],org.organizationId]);}
    const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const assign=(c:Client)=>c.query("UPDATE memberships SET role_key='manager' WHERE id=$1",[member]);
    const revoke=(c:Client)=>c.query("DELETE FROM role_permissions WHERE role_id=$1 AND permission_key='product.use'",[manager]);
    await (assignmentFirst?assign(a):revoke(a));
    const blocked=assignmentFirst?revoke(b):assign(b);
    let lock=false;
    for(let i=0;i<100;i++){if((await db.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.wait_event_type==='Lock'){lock=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
    expect(lock).toBe(true);await a.query('COMMIT');await blocked;await b.query('COMMIT');
    expect(await count()).toBe(beforeRace+1);expect((await state()).policy_blocked).toBe(true);
   }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');await a.end();await b.end();}
  }
  // Historical shape: permission was absent before a provider-bound assignment existed.
  // Construct only this fixture's legacy state; do not mutate/replay permission truth to reconcile it.
  await set(role,(await grants(role)).filter(key=>key!=='product.use'));
  await db.query("UPDATE product_memberships SET external_member_id=id,provider_receipt_reference='legacy-fixture',provisioned_at=now(),provisioning_status='active' WHERE id=$1",[pending]);
  const historicalGrants=await grants(role);
  const historicalMembership=(await db.query('SELECT role_id,role_key,status FROM memberships WHERE id=$1',[pendingMember])).rows[0];
  await reconcile();
  expect((await db.query('SELECT policy_blocked,desired_enabled,desired_revision,access_revision,provisioning_status FROM product_memberships WHERE id=$1',[pending])).rows[0]).toEqual({policy_blocked:true,desired_enabled:true,desired_revision:2,access_revision:'1',provisioning_status:'active'});
  expect(await grants(role)).toEqual(historicalGrants);
  expect((await db.query('SELECT role_id,role_key,status FROM memberships WHERE id=$1',[pendingMember])).rows[0]).toEqual(historicalMembership);
  const reconciled=(await db.query('SELECT id,source_authorization FROM product_membership_commands WHERE product_membership_id=$1 AND source_authorization IS NOT NULL',[pending])).rows;
  expect(reconciled).toHaveLength(1);expect(reconciled[0].source_authorization).toMatchObject({reason:'preexisting_authorization_gap',roleId:role,membershipId:pendingMember});
  expect((await db.query('SELECT * FROM member_denial_jobs WHERE command_id=$1',[reconciled[0].id])).rowCount).toBe(1);
  await reconcile();
  expect((await db.query('SELECT count(*)::int n FROM product_membership_commands WHERE product_membership_id=$1 AND source_authorization IS NOT NULL',[pending])).rows[0].n).toBe(1);
  expect((await db.query('SELECT access_revision FROM product_memberships WHERE id=$1',[pending])).rows[0].access_revision).toBe('1');
  for(const roleName of ['company_human_service','company_human_app','company_human_member_worker'])expect((await db.query("SELECT has_function_privilege($1,'company_human_private.reconcile_unauthorized_product_memberships()','EXECUTE') allowed",[roleName])).rows[0].allowed).toBe(false);
  // Runtime cannot target another organization or manufacture authorization provenance.
  await sql.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[users[0],org.organizationId]);
  expect((await sql.query("DELETE FROM role_permissions WHERE organization_id=$1 AND permission_key='product.use' RETURNING role_id",[foreign.organizationId])).rowCount).toBe(0);
  expect((await sql.query("UPDATE memberships SET role_key='manager' WHERE id=$1 RETURNING id",[foreignMember])).rowCount).toBe(0);
  const forged=createCanonicalId('provisioningOperation');
  await expect(sql.query("INSERT INTO product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_service_id,source_authorization) VALUES($1,$2,$3,$4,'suspendMember',$1,'authorization-revocation',$5)",[forged,org.organizationId,mapping,(await state()).desired_revision,command.source_authorization])).rejects.toThrow('row-level security');
  for(const roleName of ['company_human_service','company_human_app','company_human_member_worker'])expect((await db.query("SELECT has_function_privilege($1,'company_human_private.block_changed_product_authorization()','EXECUTE') allowed",[roleName])).rows[0].allowed).toBe(false);
 }finally{
  await sql.end();
  for(const table of ['identity_audit_events','member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','member_bootstrap_attempts','member_bootstrap_jobs','product_membership_commands','product_memberships','product_instances','memberships','role_permissions','roles'])await db.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[organizations]);
  await db.query('DELETE FROM organizations WHERE id=ANY($1)',[organizations]);await db.query('DELETE FROM products WHERE id=$1',[product]);await db.query('DELETE FROM users WHERE id=ANY($1)',[users]);
  for(const roleName of [serviceRole,workerRole]){await db.query(`DROP ROLE ${roleName}`);}
  await db.end();
 }
},30000);
