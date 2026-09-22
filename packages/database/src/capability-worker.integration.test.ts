import { readApplicationEntitlements } from './administration.js';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { describe,it,expect } from 'vitest';
import { PRODUCT_ADAPTER_METHODS,assertProductCapabilityAdapterV1,type ProductCapabilityAdapterV1,createCanonicalId } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { setProductEntitlement } from './product-entitlements.js';
import { prepareMemberCapabilitySnapshot } from './member-capability-snapshots.js';
import { claimCapability,finishCapability,dispatchCapability } from './capability-worker.js';
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)('restricted capability staging worker',()=>{
 it('stages exact snapshots with bounded retries, readback, stale denial and restricted audit',async()=>{
  const suffix=randomBytes(6).toString('hex'),role=`ch_caps_${suffix}`,password=randomBytes(20).toString('hex');
  const workerRole=`ch_capw_${suffix}`;
  const admin=new Client({connectionString:databaseUrl});await admin.connect();await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_service TO ${role}`);
  await admin.query(`CREATE ROLE ${workerRole} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_capability_worker TO ${workerRole}`);
  const url=new URL(databaseUrl!);url.username=role;url.password=password;const sql=new Client({connectionString:url.toString()});await sql.connect();
  const users=await Promise.all(['one','two'].map(name=>syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`caps-${suffix}-${name}`,primaryEmail:null,displayName:name,status:'active',eventTimestamp:1})));
  const org=await createOrganization(databaseUrl!,{ownerUserId:users[0]!,slug:`caps-a-${suffix}`,name:'A'}),other=await createOrganization(databaseUrl!,{ownerUserId:users[1]!,slug:`caps-b-${suffix}`,name:'B'});
  const orgs=[org.organizationId,other.organizationId],product=createCanonicalId('product'),instance=createCanonicalId('productInstance'),mapping=createCanonicalId('productMembership');
  const worker=new URL(url);worker.username=workerRole;const workerSql=new Client({connectionString:worker.toString()});await workerSql.connect();
  const input={actorUserId:users[0]!,organizationId:org.organizationId,productMembershipId:mapping};
  const metadata={schemaVersion:1,description:'Fixture only',category:'sales',supportedCapabilities:['read','write'],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:[],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
  try{
   await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`caps-${suffix}`,metadata]);
   await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active','fixture-org',$4)",[instance,org.organizationId,product,users[0]]);
   await admin.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,external_member_id,created_by_user_id) VALUES($1,$2,$3,$4,'suspended','fixture-member',$5)",[mapping,org.organizationId,instance,org.ownerMembershipId,users[0]]);
   const config={actorUserId:users[0]!,organizationId:org.organizationId,productInstanceId:instance,membershipId:null,capability:'read',effect:'allow' as const,expectedRevision:0};
   await setProductEntitlement(url.toString(),config);
   const fixture=(stage:ProductCapabilityAdapterV1['stageCapabilities'],read:ProductCapabilityAdapterV1['getStagedCapabilities']):ProductCapabilityAdapterV1=>{
    const a={contractVersion:2,capabilityContractVersion:1,...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(name=>[name,async()=>{throw new Error(`Unexpected ${name}`);}])) ,stageCapabilities:stage,getStagedCapabilities:read};assertProductCapabilityAdapterV1(a);return a;
   };
   const good=()=>fixture(async({idempotencyKey:_key,...state})=>({status:'succeeded',value:state}),async state=>({status:'succeeded',value:state}));
   const claim=()=>claimCapability(worker.toString(),org.organizationId,product);
   const dispatch=(adapter=good())=>dispatchCapability(worker.toString(),org.organizationId,{productId:product,adapter});
   const status=async(revision:number)=>(await admin.query('SELECT status,failure_code FROM capability_jobs WHERE product_membership_id=$1 AND revision=$2',[mapping,revision])).rows[0];
   let preference=1;
   const prepare=async()=>{await setProductEntitlement(url.toString(),{...config,expectedRevision:preference++});return prepareMemberCapabilitySnapshot(url.toString(),input);};
   await prepareMemberCapabilitySnapshot(url.toString(),input);
   await expect(claimCapability(url.toString(),org.organizationId,product)).rejects.toThrow('restricted worker');
   await expect(claimCapability(databaseUrl!,org.organizationId,product)).rejects.toThrow('restricted worker');
   expect(await claimCapability(worker.toString(),other.organizationId,product)).toBeNull();
   expect(await claimCapability(worker.toString(),org.organizationId,createCanonicalId('product'))).toBeNull();
   const claims=await Promise.all(Array.from({length:5},claim));expect(claims.filter(Boolean)).toHaveLength(1);const lease=claims.find(Boolean)!;
   const receipt={status:'succeeded',value:lease.state} as const;
   await expect(finishCapability(worker.toString(),other.organizationId,lease,receipt,receipt)).rejects.toThrow('Stale');
   const guard=`capw_audit_${suffix}`;
   await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${mapping}' AND NEW.action='product.capability.received' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
   await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
   try{await expect(finishCapability(worker.toString(),org.organizationId,lease,receipt,receipt)).rejects.toThrow('fixture audit failure');expect((await status(1)).status).toBe('running');}
   finally{await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await admin.query(`DROP FUNCTION public.${guard}()`);}
   await finishCapability(worker.toString(),org.organizationId,lease,receipt,receipt);expect((await status(1)).status).toBe('succeeded');
   const view=await readApplicationEntitlements(url.toString(),users[0]!,org.organizationId,instance,org.ownerMembershipId);
   expect(view.staging).toEqual(expect.objectContaining({policyRevision:1,matchesCurrentRequest:true,delivery:expect.objectContaining({status:'succeeded',attemptCount:1,attempts:[expect.objectContaining({number:1,outcome:'succeeded'})]})}));
   for(const privateValue of ['fixture-org','fixture-member',lease.leaseToken,'apply_receipt','readback_receipt','worker_role'])expect(JSON.stringify(view)).not.toContain(privateValue);
   expect((await readApplicationEntitlements(url.toString(),users[0]!,org.organizationId,instance)).staging).toBeNull();
   await expect(readApplicationEntitlements(url.toString(),users[1]!,other.organizationId,instance,other.ownerMembershipId)).rejects.toThrow();

   await expect(finishCapability(worker.toString(),org.organizationId,lease,receipt,receipt)).rejects.toThrow('Stale');
   await prepare();
   const queued=await readApplicationEntitlements(url.toString(),users[0]!,org.organizationId,instance,org.ownerMembershipId);
   expect(queued.staging).toEqual(expect.objectContaining({policyRevision:2,delivery:expect.objectContaining({status:'pending',attemptCount:0,attempts:[]})}));
   let read=false;
   await dispatch(fixture(async({idempotencyKey:_key,...state})=>({status:'succeeded',value:{...state,capabilities:['read','write']}}),async state=>{read=true;return {status:'succeeded',value:state};}));
   expect(read).toBe(false);expect((await status(2)).failure_code).toBe('provider_capability_mismatch');
   await prepare();await dispatch(fixture(good().stageCapabilities,async state=>({status:'succeeded',value:{...state,target:{...state.target,externalMemberId:'foreign'}}})));
   expect((await status(3)).failure_code).toBe('provider_capability_mismatch');
   await prepare();await dispatch(fixture(good().stageCapabilities,async()=>{throw new Error('secret-do-not-persist');}));
   expect((await status(4)).status).toBe('retry_wait');expect(await claim()).toBeNull();
   const attempts=(await admin.query('SELECT apply_receipt,readback_receipt FROM capability_attempts WHERE product_membership_id=$1 AND revision=4',[mapping])).rows[0];
   expect(attempts.apply_receipt.status).toBe('succeeded');expect(attempts.readback_receipt.code).toBe('adapter_transport_failure');
   await admin.query("UPDATE capability_jobs SET next_attempt_at=now()-interval '1 second' WHERE product_membership_id=$1 AND revision=4",[mapping]);
   const retry=(await claim())!;expect(retry.idempotencyKey).toBe(`capability:${mapping}:4`);expect(retry.attemptNumber).toBe(2);
   // Changed preferences without a new snapshot must still invalidate an in-flight result.
   await setProductEntitlement(url.toString(),{...config,effect:'deny',expectedRevision:preference++});
   expect((await readApplicationEntitlements(url.toString(),users[0]!,org.organizationId,instance,org.ownerMembershipId)).staging?.matchesCurrentRequest).toBe(false);
   await finishCapability(worker.toString(),org.organizationId,retry,{status:'succeeded',value:retry.state},{status:'succeeded',value:retry.state});
   expect((await status(4)).status).toBe('superseded');
   const empty=await prepareMemberCapabilitySnapshot(url.toString(),input);expect(empty.capabilities).toEqual([]);await dispatch();expect((await status(5)).status).toBe('succeeded');
   await prepare();let crash=(await claim())!;
   for(let n=2;n<=5;n++){
    await admin.query("UPDATE capability_jobs SET lease_expires_at=now()-interval '1 second' WHERE product_membership_id=$1 AND revision=6",[mapping]);
    await expect(finishCapability(worker.toString(),org.organizationId,crash,{status:'pending',operationId:'fixture'},null)).rejects.toThrow('Stale');
    const next=(await claim())!;expect(next.attemptNumber).toBe(n);expect(next.idempotencyKey).toBe(crash.idempotencyKey);crash=next;
   }
   await finishCapability(worker.toString(),org.organizationId,crash,{status:'retryable_failure',code:'provider_down'},null);expect((await status(6)).failure_code).toBe('retry_exhausted');
   await prepare();await prepare();expect(await claim()).toBeNull();expect((await status(7)).status).toBe('superseded');await dispatch();
   await prepare();await dispatch(fixture(async()=>({status:'pending',operationId:'remote-job'}),async()=>{throw new Error('Unexpected readback');}));expect((await status(9)).status).toBe('retry_wait');
   await admin.query("UPDATE capability_jobs SET next_attempt_at=now()-interval '1 second' WHERE product_membership_id=$1 AND revision=9",[mapping]);
   await dispatch(fixture(good().stageCapabilities,async()=>({status:'succeeded',value:{...lease.state,memberAccess:'active'}} as unknown as Awaited<ReturnType<ProductCapabilityAdapterV1['getStagedCapabilities']>>)));expect((await status(9)).failure_code).toBe('invalid_adapter_response');
   await prepare();const permissionRevoked=(await claim())!;
   const targetRole=(await admin.query('SELECT role_id FROM memberships WHERE id=$1',[org.ownerMembershipId])).rows[0].role_id;
   await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='product.use'",[org.organizationId,targetRole]);
   await expect(prepareMemberCapabilitySnapshot(url.toString(),input)).rejects.toThrow();
   await finishCapability(worker.toString(),org.organizationId,permissionRevoked,{status:'succeeded',value:permissionRevoked.state},{status:'succeeded',value:permissionRevoked.state});
   expect((await status(10)).status).toBe('superseded');
   await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'product.use')",[org.organizationId,targetRole]);
   await prepare();const revoked=(await claim())!;await admin.query('UPDATE product_instances SET desired_enabled=false WHERE id=$1',[instance]);
   await finishCapability(worker.toString(),org.organizationId,revoked,{status:'succeeded',value:revoked.state},{status:'succeeded',value:revoked.state});expect((await status(11)).status).toBe('superseded');
   expect((await admin.query('SELECT provisioning_status FROM product_memberships WHERE id=$1',[mapping])).rows[0].provisioning_status).toBe('suspended');
   await workerSql.query("SELECT set_config('company_human.organization_id',$1,false),set_config('company_human.product_id',$2,false)",[org.organizationId,product]);
   await expect(workerSql.query("UPDATE product_memberships SET provisioning_status='active' WHERE id=$1",[mapping])).rejects.toThrow('permission denied');
   await expect(workerSql.query("UPDATE member_capability_snapshots SET payload='{}' WHERE product_membership_id=$1",[mapping])).rejects.toThrow('permission denied');
   await expect(workerSql.query('SELECT primary_email FROM users')).rejects.toThrow('permission denied');
   await expect(workerSql.query("UPDATE capability_attempts SET outcome='succeeded' WHERE product_membership_id=$1 AND revision=2",[mapping])).rejects.toThrow('immutable');
   await workerSql.query("SELECT set_config('company_human.product_id',$1,false)",[createCanonicalId('product')]);expect((await workerSql.query('SELECT * FROM capability_jobs')).rowCount).toBe(0);
   await workerSql.query("SELECT set_config('company_human.organization_id',$1,false),set_config('company_human.product_id',$2,false)",[other.organizationId,product]);expect((await workerSql.query('SELECT * FROM capability_jobs')).rowCount).toBe(0);
   const events=(await admin.query("SELECT actor_service_id,actor_user_id,after_state FROM identity_audit_events WHERE organization_id=$1 AND actor_type='service'",[org.organizationId])).rows;
   expect(events.length).toBeGreaterThan(10);expect(events.every(e=>e.actor_service_id==='capability-worker'&&e.actor_user_id===null)).toBe(true);expect(JSON.stringify(events)).not.toContain('secret-do-not-persist');
  }finally{
   await workerSql.end();await sql.end();for(const table of ['member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','product_membership_commands','capability_attempts','capability_jobs','member_capability_snapshots','entitlement_policy_revisions','entitlement_policies','product_memberships','identity_audit_events','product_instances','memberships','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
   await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await admin.query('DELETE FROM users WHERE id=ANY($1)',[users]);await admin.query('DELETE FROM products WHERE id=$1',[product]);await admin.query(`DROP ROLE ${workerRole}`);await admin.query(`DROP ROLE ${role}`);await admin.end();
  }
 });
});
