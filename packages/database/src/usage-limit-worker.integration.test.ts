import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalId, PRODUCT_ADAPTER_METHODS, assertProductUsageLimitAdapterV1, AuditEnvelopeV1Schema, type ProductUsageLimitAdapterV1 } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { readApplicationUsageLimits } from './administration.js';
import { createOrganization } from './organizations.js';
import { appendServiceAudit } from './identity-audit.js';
import { setProductUsageLimit } from './product-usage-limits.js';
import { claimUsageLimit, finishUsageLimit, dispatchUsageLimit } from './usage-limit-worker.js';
const databaseUrl=process.env.DATABASE_URL;
function adapter(apply: ProductUsageLimitAdapterV1['applyUsageLimit'],read: ProductUsageLimitAdapterV1['getUsageLimitState']): ProductUsageLimitAdapterV1 {
  const value={contractVersion:2,usageLimitContractVersion:1,...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(name=>[name,async()=>{throw new Error(`Unexpected ${name}`);}])) ,applyUsageLimit:apply,getUsageLimitState:read};
  assertProductUsageLimitAdapterV1(value);return value;
}
const good=()=>adapter(async({idempotencyKey: _key,...state})=>({status:'succeeded',value:state}),async state=>({status:'succeeded',value:state}));
describe.skipIf(!databaseUrl)('restricted exact usage-limit dispatch',()=>{
  it('requires exact readback, fences stale work and preserves bounded audited attempts without granting access',async()=>{
    const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex');
    const serviceRole=`ch_lw_s_${suffix}`,workerRole=`ch_lw_w_${suffix}`;
    const admin=new Client({connectionString:databaseUrl});await admin.connect();
    for(const [role,grant] of [[serviceRole,'company_human_service'],[workerRole,'company_human_limit_worker']]){
      await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT ${grant} TO ${role}`);
    }
    const service=new URL(databaseUrl!);service.username=serviceRole;service.password=password;const worker=new URL(service);worker.username=workerRole;
    const owner=await syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`lw-${suffix}`,displayName:'Limit fixture',primaryEmail:null,status:'active',eventTimestamp:1});
    const org=await createOrganization(databaseUrl!,{ownerUserId:owner,name:'Limit fixture',slug:`lw-${suffix}`});
    const foreign=await createOrganization(databaseUrl!,{ownerUserId:owner,name:'Foreign fixture',slug:`lw-foreign-${suffix}`});
    const orgs=[org.organizationId,foreign.organizationId],product=createCanonicalId('product'),instance=createCanonicalId('productInstance');
    const sql=new Client({connectionString:worker.toString()});await sql.connect();
    const metadata={schemaVersion:1,description:'Test only',category:'sales',supportedCapabilities:['enrich'],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:['leads'],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
    const input={actorUserId:owner,organizationId:org.organizationId,productInstanceId:instance,membershipId:null,meterKey:'leads',unit:'lead',window:'utc_month' as const,maximumQuantity:'10',expectedRevision:0};
    const claim=()=>claimUsageLimit(worker.toString(),org.organizationId,product);
    const dispatch=(a=good())=>dispatchUsageLimit(worker.toString(),org.organizationId,{productId:product,adapter:a});
    const save=(revision:number,quantity='10')=>setProductUsageLimit(service.toString(),{...input,expectedRevision:revision,maximumQuantity:quantity});
    const status=async(id:string,revision:number)=>(await admin.query('SELECT status,failure_code FROM usage_limit_jobs WHERE usage_limit_id=$1 AND revision=$2',[id,revision])).rows[0];
    try {
      await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`lw-${suffix}`,metadata]);
      await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active','fixture-org',$4)",[instance,org.organizationId,product,owner]);
      const first=await save(0);const id=first.usageLimitId;
      await expect(claimUsageLimit(service.toString(),org.organizationId,product)).rejects.toThrow('restricted worker');
      await expect(claimUsageLimit(databaseUrl!,org.organizationId,product)).rejects.toThrow('restricted worker');
      expect(await claimUsageLimit(worker.toString(),foreign.organizationId,product)).toBeNull();
      expect(await claimUsageLimit(worker.toString(),org.organizationId,createCanonicalId('product'))).toBeNull();
      await expect(dispatch({...good(),usageLimitContractVersion:2} as unknown as ProductUsageLimitAdapterV1)).rejects.toThrow('extension version');
      const claims=await Promise.all(Array.from({length:5},claim));expect(claims.filter(Boolean)).toHaveLength(1);const lease=claims.find(Boolean)!;
      expect(lease.state.scope).toBe('organization_aggregate');
      const receipt={status:'succeeded',value:lease.state} as const;
      await expect(finishUsageLimit(worker.toString(),foreign.organizationId,lease,receipt,receipt)).rejects.toThrow('Stale');
      // Audit failure rolls back job and attempt completion.
      const guard=`lw_audit_${suffix}`;
      await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${id}' AND NEW.action='product.usage_limit.received' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
      try {await expect(finishUsageLimit(worker.toString(),org.organizationId,lease,receipt,receipt)).rejects.toThrow('fixture audit failure');expect((await status(id,1)).status).toBe('running');}
      finally {await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await admin.query(`DROP FUNCTION public.${guard}()`);}
      await finishUsageLimit(worker.toString(),org.organizationId,lease,receipt,receipt);expect((await status(id,1)).status).toBe('succeeded');
      await expect(finishUsageLimit(worker.toString(),org.organizationId,lease,receipt,receipt)).rejects.toThrow('Stale');
      const observed=await readApplicationUsageLimits(service.toString(),owner,org.organizationId,instance);
      const delivered=observed.settings.find(row=>row.window==='utc_month')!;
      expect(delivered.delivery).toEqual(expect.objectContaining({status:'succeeded',attemptCount:1,attempts:[expect.objectContaining({number:1,outcome:'succeeded'})]}));
      expect(JSON.stringify(observed)).not.toContain('fixture-org');expect(JSON.stringify(observed)).not.toContain(lease.leaseToken);
      expect(JSON.stringify(observed)).not.toContain('apply_receipt');expect(JSON.stringify(observed)).not.toContain('readback_receipt');
      await save(1);
      const queued=await readApplicationUsageLimits(service.toString(),owner,org.organizationId,instance);
      expect(queued.settings.find(row=>row.window==='utc_month')?.delivery).toEqual(expect.objectContaining({status:'pending',attemptCount:0,attempts:[]}));
      let readCalled=false;
      await dispatch(adapter(async({idempotencyKey:_key,...state})=>({status:'succeeded',value:{...state,limit:{...state.limit,maximumQuantity:'11'}}}),async state=>{readCalled=true;return {status:'succeeded',value:state};}));
      expect(readCalled).toBe(false);expect((await status(id,2)).failure_code).toBe('provider_limit_mismatch');
      await save(2);await dispatch(adapter(good().applyUsageLimit,async state=>({status:'succeeded',value:{...state,target:{...state.target,externalOrganizationId:'foreign'}}})));
      expect((await status(id,3)).failure_code).toBe('provider_limit_mismatch');
      await save(3);
      // Accelerate only the adapter deadline, retaining real PostgreSQL timers.
      // A completed apply must survive timeout of the separate provider readback.
      const realTimeout=globalThis.setTimeout;
      const deadlineTimer=vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback: (...args: unknown[])=>void, delay?:number, ...args: unknown[])=>
        realTimeout(callback,delay!==undefined && delay>59000 && delay<=60000 ? 1 : delay,...args)) as typeof setTimeout);
      let releaseReadback: (()=>void) | undefined;
      try {
        await dispatch(adapter(good().applyUsageLimit,state=>new Promise(resolve=>{releaseReadback=()=>resolve({status:'succeeded',value:state});})));
      } finally {deadlineTimer.mockRestore();}
      expect(releaseReadback).toBeDefined();
      expect((await status(id,4)).status).toBe('retry_wait');expect(await claim()).toBeNull();
      const attempt=(await admin.query('SELECT apply_receipt,readback_receipt FROM usage_limit_attempts WHERE usage_limit_id=$1 AND revision=4',[id])).rows[0];
      expect(attempt.apply_receipt.status).toBe('succeeded');expect(attempt.readback_receipt.code).toBe('adapter_transport_failure');
      releaseReadback!();await Promise.resolve();
      expect((await admin.query('SELECT apply_receipt,readback_receipt FROM usage_limit_attempts WHERE usage_limit_id=$1 AND revision=4',[id])).rows[0]).toEqual(attempt);
      await admin.query("UPDATE usage_limit_jobs SET next_attempt_at=now()-interval '1 second' WHERE usage_limit_id=$1 AND revision=4",[id]);
      await dispatch(adapter(good().applyUsageLimit,async()=>{throw new Error('secret-not-to-persist');}));
      const exceptionAttempt=(await admin.query('SELECT apply_receipt,readback_receipt FROM usage_limit_attempts WHERE usage_limit_id=$1 AND revision=4 AND attempt_number=2',[id])).rows[0];
      expect(exceptionAttempt.apply_receipt.status).toBe('succeeded');expect(exceptionAttempt.readback_receipt).toEqual({status:'retryable_failure',code:'adapter_transport_failure'});
      await admin.query("UPDATE usage_limit_jobs SET next_attempt_at=now()-interval '1 second' WHERE usage_limit_id=$1 AND revision=4",[id]);
      const retry=(await claim())!;expect(retry.attemptNumber).toBe(3);expect(retry.idempotencyKey).toBe(`usage-limit:${id}:4`);
      await save(4,'0');await finishUsageLimit(worker.toString(),org.organizationId,retry,{status:'succeeded',value:retry.state},{status:'succeeded',value:retry.state});
      expect((await status(id,4)).status).toBe('superseded');await dispatch();expect((await status(id,5)).status).toBe('succeeded');
      // Expired leases cannot complete; retries keep one key and stop after five attempts.
      await save(5);let crash=(await claim())!;
      for(let n=2;n<=5;n++){
        await admin.query("UPDATE usage_limit_jobs SET lease_expires_at=now()-interval '1 second' WHERE usage_limit_id=$1 AND revision=6",[id]);
        await expect(finishUsageLimit(worker.toString(),org.organizationId,crash,{status:'pending',operationId:'fixture'},null)).rejects.toThrow('Stale');
        const next=(await claim())!;expect(next.idempotencyKey).toBe(crash.idempotencyKey);expect(next.attemptNumber).toBe(n);crash=next;
      }
      await finishUsageLimit(worker.toString(),org.organizationId,crash,{status:'retryable_failure',code:'provider_down'},null);expect((await status(id,6)).failure_code).toBe('retry_exhausted');
      // Member policies wait for a provider binding, apply while suspended, and never resume.
      const member=await setProductUsageLimit(service.toString(),{...input,membershipId:org.ownerMembershipId});expect(await claim()).toBeNull();
      const mapping=createCanonicalId('productMembership');
      await admin.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,external_member_id,provisioning_status,created_by_user_id) VALUES($1,$2,$3,$4,'fixture-member','suspended',$5)",[mapping,org.organizationId,instance,org.ownerMembershipId,owner]);
      await dispatch();expect((await status(member.usageLimitId,1)).status).toBe('succeeded');
      const memberView=await readApplicationUsageLimits(service.toString(),owner,org.organizationId,instance,org.ownerMembershipId);
      expect(memberView.settings.find(row=>row.window==='utc_month')?.delivery?.status).toBe('succeeded');
      expect(memberView.settings.find(row=>row.window==='utc_month')?.organizationDelivery?.status).toBe('failed');
      expect((await admin.query('SELECT provisioning_status FROM product_memberships WHERE id=$1',[mapping])).rows[0].provisioning_status).toBe('suspended');
      // A revoke and restore cannot make an older positive member limit receipt current again.
      const memberRevision=await setProductUsageLimit(service.toString(),{...input,membershipId:org.ownerMembershipId,expectedRevision:1,maximumQuantity:'9'});
      expect(memberRevision.revision).toBe(2);
      // Isolated fixture reset permits a claim; production has no activation path that clears this flag yet.
      await admin.query('UPDATE product_memberships SET policy_blocked=false WHERE id=$1',[mapping]);
      const staleMember=(await claim())!;
      const ownerRole=(await admin.query('SELECT role_id FROM memberships WHERE id=$1',[org.ownerMembershipId])).rows[0].role_id;
      await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='product.use'",[org.organizationId,ownerRole]);
      await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'product.use')",[org.organizationId,ownerRole]);
      await finishUsageLimit(worker.toString(),org.organizationId,staleMember,
        {status:'succeeded',value:staleMember.state},{status:'succeeded',value:staleMember.state});
      expect((await status(member.usageLimitId,2)).status).toBe('superseded');
      expect((await admin.query('SELECT claimed_access_revision FROM usage_limit_attempts WHERE usage_limit_id=$1 AND revision=2',[member.usageLimitId])).rows[0].claimed_access_revision).toBe('1');
      expect((await admin.query('SELECT access_revision,policy_blocked FROM product_memberships WHERE id=$1',[mapping])).rows[0]).toEqual({access_revision:'2',policy_blocked:true});
      // A second catalog requirement is checked at receipt time, not merely at claim.
      await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,{...metadata,requiredPermissions:['product.use','billing.read.all']}]);
      await setProductUsageLimit(service.toString(),{...input,membershipId:org.ownerMembershipId,expectedRevision:2,maximumQuantity:'8'});
      await admin.query('UPDATE product_memberships SET policy_blocked=false WHERE id=$1',[mapping]);
      const extraPermission=(await claim())!;expect(extraPermission.state.scope).toBe('member');
      await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='billing.read.all'",[org.organizationId,ownerRole]);
      await finishUsageLimit(worker.toString(),org.organizationId,extraPermission,
        {status:'succeeded',value:extraPermission.state},{status:'succeeded',value:extraPermission.state});
      expect((await status(member.usageLimitId,3)).status).toBe('superseded');
      await setProductUsageLimit(service.toString(),{...input,membershipId:org.ownerMembershipId,expectedRevision:3,maximumQuantity:'7'});
      await admin.query('UPDATE product_memberships SET policy_blocked=false WHERE id=$1',[mapping]);
      expect(await claim()).toBeNull();expect((await status(member.usageLimitId,4)).status).toBe('superseded');
      await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'billing.read.all')",[org.organizationId,ownerRole]);
      // Target revocation during a call makes its otherwise valid receipt historical.
      await save(6);const revoked=(await claim())!;await admin.query("UPDATE product_instances SET desired_enabled=false WHERE id=$1",[instance]);
      await finishUsageLimit(worker.toString(),org.organizationId,revoked,{status:'succeeded',value:revoked.state},{status:'succeeded',value:revoked.state});expect((await status(id,7)).status).toBe('superseded');
      await save(7,'0');await dispatch();expect((await status(id,8)).status).toBe('succeeded');
      // Pending remote application never calls readback, and malformed readback is not success.
      await save(8,'0');let unexpectedRead=false;
      await dispatch(adapter(async()=>({status:'pending',operationId:'fixture-pending'}),async state=>{unexpectedRead=true;return {status:'succeeded',value:state};}));
      expect(unexpectedRead).toBe(false);expect((await status(id,9)).status).toBe('retry_wait');
      await admin.query("UPDATE usage_limit_jobs SET next_attempt_at=now()-interval '1 second' WHERE usage_limit_id=$1 AND revision=9",[id]);
      await dispatch(adapter(good().applyUsageLimit,async()=>({status:'succeeded',value:{credentials:'must-not-persist'}} as unknown as Awaited<ReturnType<ProductUsageLimitAdapterV1['getUsageLimitState']>>)));
      expect((await status(id,9)).failure_code).toBe('invalid_adapter_response');
      await save(9);expect(await claim()).toBeNull();expect((await status(id,10)).status).toBe('superseded');
      await save(10,'0');await save(11,'0');expect(await claim()).toBeNull();expect((await status(id,11)).status).toBe('superseded');
      await dispatch();expect((await status(id,12)).status).toBe('succeeded');
      // Worker can neither grant access nor change policies, identities or completed receipts.
      await sql.query("SELECT set_config('company_human.organization_id',$1,false),set_config('company_human.product_id',$2,false)",[org.organizationId,product]);
      await expect(sql.query("UPDATE product_memberships SET provisioning_status='active' WHERE id=$1",[mapping])).rejects.toThrow('permission denied');
      await expect(sql.query('UPDATE product_usage_limit_revisions SET maximum_quantity=100 WHERE usage_limit_id=$1',[id])).rejects.toThrow('permission denied');
      await expect(appendServiceAudit(sql,{organizationId:org.organizationId,serviceId:'forged',action:'product.usage_limit.claimed',targetType:'usage_limit',targetId:id,afterState:{}})).rejects.toThrow();
      await expect(sql.query('SELECT primary_email FROM users')).rejects.toThrow('permission denied');
      await expect(sql.query('DELETE FROM usage_limit_attempts WHERE usage_limit_id=$1',[id])).rejects.toThrow('permission denied');
      await expect(sql.query("UPDATE usage_limit_attempts SET outcome='succeeded' WHERE usage_limit_id=$1 AND revision=2",[id])).rejects.toThrow('immutable');
      await sql.query("SELECT set_config('company_human.product_id',$1,false)",[createCanonicalId('product')]);expect((await sql.query('SELECT * FROM usage_limit_jobs')).rowCount).toBe(0);
      await sql.query("SELECT set_config('company_human.organization_id',$1,false),set_config('company_human.product_id',$2,false)",[foreign.organizationId,product]);expect((await sql.query('SELECT * FROM usage_limit_jobs')).rowCount).toBe(0);
      const events=(await admin.query("SELECT envelope,actor_service_id,after_state FROM identity_audit_events WHERE organization_id=$1 AND actor_type='service' AND action LIKE 'product.usage_limit.%'",[org.organizationId])).rows;
      expect(events.length).toBeGreaterThan(10);for(const event of events){AuditEnvelopeV1Schema.parse(event.envelope);expect(event.actor_service_id).toBe('usage-limit-worker');}
      expect(JSON.stringify(events)).not.toContain('fixture-member');expect(JSON.stringify(events)).not.toContain('secret-not-to-persist');
    } finally {
      await sql.end();
      for(const table of ['member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','product_membership_commands','usage_limit_attempts','usage_limit_jobs','product_usage_limit_revisions','product_usage_limits','product_memberships','identity_audit_events','product_instances','memberships','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
      await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await admin.query('DELETE FROM users WHERE id=$1',[owner]);await admin.query('DELETE FROM products WHERE id=$1',[product]);
      for(const role of [serviceRole,workerRole])await admin.query(`DROP ROLE ${role}`);await admin.end();
    }
  });
});
