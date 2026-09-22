import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe,expect,it } from "vitest";
import { assertProductAdapterV1,assertProductMemberAccessAdapterV1,PRODUCT_ADAPTER_METHODS,createCanonicalId,type ProductAdapterV1,type MemberAccessCommand,type MemberAccessResult } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { requestProductMembership } from "./product-memberships.js";
import { disableProductInstance } from "./product-instances.js";
import { appendIdentityAudit, appendServiceAudit } from "./identity-audit.js";
import { listAuditEvents, listApplicationMemberDiagnostics } from "./administration.js";
import { referenceProductId } from "./seed.js";
import { claimMemberDenial,finishMemberDenial,dispatchMemberDenial } from "./member-denial-worker.js";
const databaseUrl=process.env.DATABASE_URL;
function adapter(suspend:ProductAdapterV1['suspendMember'],remove:ProductAdapterV1['removeMember']=suspend):ProductAdapterV1 {
  const value={contractVersion:1,...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(name=>[name,async()=>{throw new Error(`Unexpected fixture ${name}`);}])) ,suspendMember:suspend,removeMember:remove};
  assertProductAdapterV1(value);return value;
}
describe.skipIf(!databaseUrl)('durable member denial worker',()=>{
  it('isolates jobs, retries stable intent, rejects stale receipts and continues after the initiating human is suspended',async()=>{
    const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex');
    const serviceRole=`ch_deny_service_${suffix}`,workerRole=`ch_deny_worker_${suffix}`;
    const admin=new Client({connectionString:databaseUrl});await admin.connect();
    for(const [role,grant] of [[serviceRole,'company_human_service'],[workerRole,'company_human_member_worker']]) {
      await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT ${grant} TO ${role}`);
    }
    const service=new URL(databaseUrl!);service.username=serviceRole;service.password=password;
    const worker=new URL(service);worker.username=workerRole;
    const owner=await syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`deny-${suffix}`,displayName:'Worker fixture',primaryEmail:null,status:'active',eventTimestamp:1});
    const org=await createOrganization(databaseUrl!,{ownerUserId:owner,name:'Denial fixture',slug:`denial-${suffix}`});
    const foreign=await createOrganization(databaseUrl!,{ownerUserId:owner,name:'Foreign fixture',slug:`denial-other-${suffix}`});
    const orgIds=[org.organizationId,foreign.organizationId],scalar=referenceProductId('scalar');
    const member=(await admin.query('SELECT id FROM memberships WHERE organization_id=$1',[org.organizationId])).rows[0].id;
    async function setup(key:string,deny=true) {
      const instance=createCanonicalId('productInstance');
      await admin.query(`INSERT INTO product_instances (id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id)
        VALUES ($1,$2,$3,$4,'connected','active',$5,$6)`,[instance,org.organizationId,scalar,key,`fixture-${key}-${suffix}`,owner]);
      const mapping=await requestProductMembership(service.toString(),{actorUserId:owner,organizationId:org.organizationId,productInstanceId:instance,membershipId:member});
      if(deny)await disableProductInstance(service.toString(),{actorUserId:owner,organizationId:org.organizationId,productInstanceId:instance});
      return {instance,mapping};
    }
    const sql=new Client({connectionString:worker.toString()});await sql.connect();
    try {
      const first=await setup('first');await setup('unrequested',false);
      const read=()=>listApplicationMemberDiagnostics(service.toString(),owner,org.organizationId,first.instance);
      const queued=await read();expect(queued.total).toBe(1);expect(queued.members[0]!.denial?.status).toBe('pending');
      expect(queued.members[0]!.desiredEnabled).toBe(false);
      expect((await listApplicationMemberDiagnostics(service.toString(),owner,org.organizationId,first.instance,2)).members).toEqual([]);
      await expect(listApplicationMemberDiagnostics(service.toString(),owner,foreign.organizationId,first.instance)).rejects.toThrow('administration denied');
      await expect(claimMemberDenial(service.toString(),org.organizationId,scalar)).rejects.toThrow('restricted worker');
      await expect(claimMemberDenial(databaseUrl!,org.organizationId,scalar)).rejects.toThrow('restricted worker');
      expect(await claimMemberDenial(worker.toString(),foreign.organizationId,scalar)).toBeNull();
      expect(await claimMemberDenial(worker.toString(),org.organizationId,referenceProductId('cadre'))).toBeNull();
      const claims=await Promise.all(Array.from({length:6},()=>claimMemberDenial(worker.toString(),org.organizationId,scalar)));
      expect(claims.filter(Boolean)).toHaveLength(1);const lease=claims.find(Boolean)!;
      expect(lease.operation).toBe('suspendMember');expect(lease.idempotencyKey).toBe(`${first.mapping}:member:2`);
      const claimAudit=(await admin.query("SELECT actor_type,actor_user_id,actor_service_id,envelope FROM identity_audit_events WHERE target_id=$1 AND action='product.member_denial.claimed'",[lease.commandId])).rows;
      expect(claimAudit).toHaveLength(1);expect(claimAudit[0].actor_type).toBe('service');expect(claimAudit[0].actor_user_id).toBeNull();
      expect(claimAudit[0].envelope.actor).toEqual({type:'service',id:'member-denial-worker'});
      // An audit failure must roll back the provider receipt and job completion.
      const guard=`deny_audit_failure_${suffix}`;
      await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.target_id='${lease.commandId}' AND NEW.action='product.member_denial.received' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
      try {
        await expect(finishMemberDenial(worker.toString(),org.organizationId,lease,{status:'pending',operationId:'fixture-operation'})).rejects.toThrow('fixture audit failure');
        expect((await admin.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[lease.commandId])).rows[0].status).toBe('running');
        expect((await admin.query('SELECT finished_at FROM member_denial_attempts WHERE command_id=$1',[lease.commandId])).rows[0].finished_at).toBeNull();
      } finally {await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await admin.query(`DROP FUNCTION public.${guard}()`);}
      await finishMemberDenial(worker.toString(),org.organizationId,lease,{status:'pending',operationId:'fixture-operation'});
      expect(await claimMemberDenial(worker.toString(),org.organizationId,scalar)).toBeNull();
      await admin.query("UPDATE member_denial_jobs SET next_attempt_at=now()-interval '1 second' WHERE command_id=$1",[lease.commandId]);
      const retried=(await claimMemberDenial(worker.toString(),org.organizationId,scalar))!;
      expect(retried.idempotencyKey).toBe(lease.idempotencyKey);expect(retried.attemptNumber).toBe(2);
      await expect(finishMemberDenial(worker.toString(),org.organizationId,lease,{status:'succeeded',value:{externalMemberId:'fixture',status:'suspended'}})).rejects.toThrow('Stale');
      // The initiating actor is no longer active; cleanup must still complete.
      await admin.query("UPDATE memberships SET status='suspended' WHERE id=$1",[member]);
      await expect(read()).rejects.toThrow('administration denied');
      await finishMemberDenial(worker.toString(),org.organizationId,retried,{status:'succeeded',value:{externalMemberId:'fixture-member',status:'suspended'}});
      expect((await admin.query('SELECT status,provider_reference FROM member_denial_jobs WHERE command_id=$1',[lease.commandId])).rows[0]).toEqual({status:'succeeded',provider_reference:'fixture-member'});
      await admin.query("UPDATE memberships SET status='active' WHERE id=$1",[member]);
      const confirmed=await read();expect(confirmed.members[0]!.denial?.status).toBe('succeeded');
      expect(confirmed.members[0]!.denial?.attempts).toHaveLength(2);
      const projection=JSON.stringify(confirmed);
      for(const secret of [lease.leaseToken,retried.leaseToken,'fixture-operation','fixture-member','provider_reference','worker_role'])expect(projection).not.toContain(secret);
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)",[org.organizationId]);
      await expect(appendIdentityAudit(sql,{organizationId:org.organizationId,actorUserId:owner,action:'product.member_denial.claimed',targetType:'product_membership_command',targetId:lease.commandId})).rejects.toThrow();
      await expect(appendServiceAudit(sql,{organizationId:org.organizationId,serviceId:'forged-service',action:'product.member_denial.claimed',targetType:'product_membership_command',targetId:lease.commandId,afterState:{}})).rejects.toThrow();
      await expect(sql.query('DELETE FROM identity_audit_events WHERE target_id=$1',[lease.commandId])).rejects.toThrow('permission denied');
      const history=await listAuditEvents(service.toString(),owner,org.organizationId);
      const serviceEvents=history.events.filter(event=>event.targetId===lease.commandId);
      expect(serviceEvents).toHaveLength(4);
      expect(serviceEvents.every(event=>event.actorType==='service'&&event.actorUserId===null&&event.actorServiceId==='member-denial-worker')).toBe(true);
      expect(JSON.stringify(serviceEvents)).not.toContain(lease.leaseToken);

      await expect(sql.query("UPDATE product_memberships SET provisioning_status='active' WHERE id=$1",[first.mapping])).rejects.toThrow('permission denied');
      await expect(sql.query("DELETE FROM member_denial_attempts WHERE command_id=$1",[lease.commandId])).rejects.toThrow('permission denied');
      await expect(sql.query("UPDATE member_denial_attempts SET outcome='permanent_failure' WHERE command_id=$1",[lease.commandId])).rejects.toThrow('immutable');
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)",[foreign.organizationId]);
      expect((await sql.query('SELECT * FROM member_denial_jobs WHERE command_id=$1',[lease.commandId])).rowCount).toBe(0);
      // Legacy adapters must fail before claiming work or making provider calls.
      await expect(dispatchMemberDenial(worker.toString(),org.organizationId,{productId:scalar,adapter:adapter(async()=>{throw new Error('must not call');})})).rejects.toThrow('fenced member access');
      // A newer remove supersedes suspension. Record the old receipt without
      // treating it as proof that the current command has completed.
      const revision=await setup('revision');const old=(await claimMemberDenial(worker.toString(),org.organizationId,scalar))!;
      await admin.query('UPDATE product_memberships SET desired_revision=3 WHERE id=$1',[revision.mapping]);
      const removal=createCanonicalId('provisioningOperation');
      await admin.query(`INSERT INTO product_membership_commands (id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id)
        VALUES ($1,$2,$3,3,'removeMember',$4,$5)`,[removal,org.organizationId,revision.mapping,`${revision.mapping}:member:3`,owner]);
      expect(await claimMemberDenial(worker.toString(),org.organizationId,scalar)).toBeNull();
      await finishMemberDenial(worker.toString(),org.organizationId,old,{status:'succeeded',value:{externalMemberId:'fixture-revision',status:'suspended'}});
      expect((await admin.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[old.commandId])).rows[0].status).toBe('superseded');
      const removalLease=(await claimMemberDenial(worker.toString(),org.organizationId,scalar))!;
      await finishMemberDenial(worker.toString(),org.organizationId,removalLease,{status:'succeeded',value:{externalMemberId:'fixture-revision',status:'removed'}});
      // Crash recovery uses the same command key and bounds five attempts.
      await setup('crashed');const crashed=(await claimMemberDenial(worker.toString(),org.organizationId,scalar))!;
      let current=crashed;
      for(let attempt=2;attempt<=5;attempt++) {
        await admin.query("UPDATE member_denial_jobs SET lease_expires_at=now()-interval '1 second' WHERE command_id=$1",[crashed.commandId]);
        current=(await claimMemberDenial(worker.toString(),org.organizationId,scalar))!;expect(current.attemptNumber).toBe(attempt);expect(current.idempotencyKey).toBe(crashed.idempotencyKey);
      }
      await finishMemberDenial(worker.toString(),org.organizationId,current,{status:'retryable_failure',code:'provider_down'});
      expect((await admin.query('SELECT status,failure_code FROM member_denial_jobs WHERE command_id=$1',[crashed.commandId])).rows[0]).toEqual({status:'failed',failure_code:'retry_exhausted'});
      expect(await claimMemberDenial(worker.toString(),org.organizationId,scalar)).toBeNull();
      expect((await admin.query('SELECT count(*)::int AS n FROM member_denial_attempts WHERE command_id=$1',[crashed.commandId])).rows[0].n).toBe(5);
      // Existing product-disable API atomically creates a fenced command and job.
      const fenced=await setup('fenced',false);
      await admin.query("UPDATE product_memberships SET external_member_id='fenced-member' WHERE id=$1",[fenced.mapping]);
      await disableProductInstance(service.toString(),{actorUserId:owner,organizationId:org.organizationId,productInstanceId:fenced.instance});
      const journal=(await admin.query('SELECT * FROM member_access_commands WHERE product_membership_id=$1',[fenced.mapping])).rows[0];
      expect(journal.access_revision).toBe('1');expect(journal.external_member_id).toBe('fenced-member');
      expect((await admin.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[journal.command_id])).rows[0].status).toBe('pending');
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)",[foreign.organizationId]);
      expect((await sql.query('SELECT * FROM member_access_commands WHERE command_id=$1',[journal.command_id])).rowCount).toBe(0);
      await expect(sql.query('UPDATE product_memberships SET access_revision=99 WHERE id=$1',[fenced.mapping])).rejects.toThrow('permission denied');
      await expect(sql.query('DELETE FROM member_access_commands WHERE command_id=$1',[journal.command_id])).rejects.toThrow('permission denied');
      let providerCurrent:MemberAccessCommand|null=null, calls=0, failReadback=true;
      const fixture={contractVersion:2,capabilityContractVersion:1,usageLimitContractVersion:1,memberAccessContractVersion:1,
        ...Object.fromEntries([...PRODUCT_ADAPTER_METHODS,'stageCapabilities','getStagedCapabilities','applyUsageLimit','getUsageLimitState'].map(name=>[name,async()=>{throw new Error('legacy method forbidden');}])),
        async setMemberAccess(command:MemberAccessCommand):Promise<MemberAccessResult>{calls++;providerCurrent=command;return{status:'succeeded',value:command};},
        async getMemberAccessOperation(){return providerCurrent?{status:'applied',value:providerCurrent}:{status:'unknown'};},
        async getMemberAccess():Promise<MemberAccessResult>{if(failReadback)throw new Error('secret provider failure');return{status:'succeeded',value:providerCurrent!};}};
      assertProductMemberAccessAdapterV1(fixture);
      expect(await dispatchMemberDenial(worker.toString(),org.organizationId,{productId:scalar,adapter:fixture})).toBe('processed');
      expect((await admin.query('SELECT status,failure_code FROM member_denial_jobs WHERE command_id=$1',[journal.command_id])).rows[0]).toMatchObject({status:'retry_wait',failure_code:'adapter_transport_failure'});
      await admin.query("UPDATE member_denial_jobs SET next_attempt_at=now()-interval '1 second' WHERE command_id=$1",[journal.command_id]);
      failReadback=false;
      expect(await dispatchMemberDenial(worker.toString(),org.organizationId,{productId:scalar,adapter:fixture})).toBe('processed');
      expect(calls).toBe(1); // persisted operation lookup reconciles the lost readback; no duplicate mutation
      expect((await admin.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[journal.command_id])).rows[0].status).toBe('succeeded');
      expect(providerCurrent).toMatchObject({access:'suspended',accessRevision:1,idempotencyKey:`${fenced.mapping}:member:2`,policy:null});
      const appendDenial=async(revision:number,operation:string)=>{
        const id=createCanonicalId('provisioningOperation');
        await admin.query('UPDATE product_memberships SET desired_revision=$2 WHERE id=$1',[fenced.mapping,revision]);
        await admin.query(`INSERT INTO product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,org.organizationId,fenced.mapping,revision,operation,`${fenced.mapping}:member:${revision}`,owner]);
      };
      await appendDenial(3,'suspendMember');
      const outstanding=(await claimMemberDenial(worker.toString(),org.organizationId,scalar,true))!;
      await appendDenial(4,'removeMember');
      const superseding=(await claimMemberDenial(worker.toString(),org.organizationId,scalar,true))!;
      expect(outstanding.accessCommand?.accessRevision).toBe(2);
      expect(superseding.accessCommand?.accessRevision).toBe(3);
      expect(superseding.accessCommand?.access).toBe('removed');
      await finishMemberDenial(worker.toString(),org.organizationId,superseding,{status:'succeeded',value:{externalMemberId:'fenced-member',status:'removed'}});
      await finishMemberDenial(worker.toString(),org.organizationId,outstanding,{status:'succeeded',value:{externalMemberId:'fenced-member',status:'suspended'}});
      expect((await admin.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[outstanding.commandId])).rows[0].status).toBe('superseded');
      // No remote call is made when bootstrap has not supplied a binding; the failure is visible.
      const unbound=await setup('unbound');const priorCalls=calls;
      expect(await dispatchMemberDenial(worker.toString(),org.organizationId,{productId:scalar,adapter:fixture})).toBe('processed');
      expect(calls).toBe(priorCalls);
      expect((await admin.query(`SELECT j.status,j.failure_code FROM member_denial_jobs j JOIN product_membership_commands c ON c.id=j.command_id WHERE c.product_membership_id=$1`,[unbound.mapping])).rows[0]).toEqual({status:'failed',failure_code:'provider_binding_reconciliation_required'});
      for(const change of ['organization','member','revision']){
        const race=await setup(`binding-${change}`,false);
        await admin.query("UPDATE product_memberships SET external_member_id='race-member' WHERE id=$1",[race.mapping]);
        await disableProductInstance(service.toString(),{actorUserId:owner,organizationId:org.organizationId,productInstanceId:race.instance});
        const raced=(await claimMemberDenial(worker.toString(),org.organizationId,scalar,true))!;
        if(change==='organization'){
          // Privileged binding-owner fixture models a provider reconnection between claim and receipt.
          await admin.query('BEGIN');
          await admin.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.user_id',$2,true)",[org.organizationId,owner]);
          await admin.query('SET LOCAL ROLE company_human_activation');
          expect((await admin.query("UPDATE product_instances SET external_organization_id='changed-org' WHERE id=$1",[race.instance])).rowCount).toBe(1);
          await admin.query('COMMIT');
        }
        if(change==='member')await admin.query("UPDATE product_memberships SET external_member_id='changed-member' WHERE id=$1",[race.mapping]);
        if(change==='revision')await admin.query("UPDATE product_memberships SET access_revision=access_revision+1 WHERE id=$1",[race.mapping]);
        await finishMemberDenial(worker.toString(),org.organizationId,raced,{status:'succeeded',value:{externalMemberId:'race-member',status:'suspended'}});
        const finished=(await admin.query('SELECT status,failure_code FROM member_denial_jobs WHERE command_id=$1',[raced.commandId])).rows[0];
        expect(finished).toEqual(change==='revision'?{status:'superseded',failure_code:'superseded_revision'}:{status:'failed',failure_code:'provider_binding_reconciliation_required'});
      }
    } finally {
      await sql.end();
      for(const table of ['member_denial_attempts','member_denial_jobs','product_membership_commands','product_memberships','identity_audit_events','product_instances','memberships','roles']) await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgIds]);
      await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[orgIds]);await admin.query('DELETE FROM users WHERE id=$1',[owner]);
      for(const role of [serviceRole,workerRole]) await admin.query(`DROP ROLE ${role}`);await admin.end();
    }
  });
});
