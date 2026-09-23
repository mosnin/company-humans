import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";
import { OrganizationIdSchema, ProductIdSchema, ProductMembershipIdSchema, StagedCapabilitiesStateSchema, CapabilityAdapterResultSchema,
  assertProductCapabilityAdapterV1, matchesStagedCapabilities,
  type OrganizationId, type ProductId, type StagedCapabilitiesState, type ProductCapabilityAdapterV1 } from "@company-human/contracts";
import { readCurrentCapabilityInputs } from "./capability-source.js";
import { appendServiceAudit } from "./identity-audit.js";
type Receipt = z.infer<typeof CapabilityAdapterResultSchema>;
interface Row {
 organization_id:string;product_membership_id:string;revision:number;status:string;attempt_count:number;
 lease_token:string|null;expired:boolean;latest:boolean;payload:unknown;
}
export interface CapabilityLease {productId:ProductId;productMembershipId:string;state:StagedCapabilitiesState;leaseToken:string;attemptNumber:number;idempotencyKey:string;}
const selection=`SELECT j.*,j.lease_expires_at<=clock_timestamp() AS expired,s.payload,
 NOT EXISTS(SELECT 1 FROM public.member_capability_snapshots newer WHERE newer.product_membership_id=j.product_membership_id AND newer.policy_revision>j.revision) AS latest
 FROM public.capability_jobs j JOIN public.member_capability_snapshots s ON s.organization_id=j.organization_id AND s.product_membership_id=j.product_membership_id AND s.policy_revision=j.revision
 JOIN public.product_memberships pm ON pm.organization_id=j.organization_id AND pm.id=j.product_membership_id
 JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id`;
function stateFor(row:Row):StagedCapabilitiesState|null{const p=StagedCapabilitiesStateSchema.safeParse(row.payload);return p.success?p.data:null;}
async function current(client:Client,row:Row):Promise<boolean>{
 if(!row.latest)return false;
 const inputs=await readCurrentCapabilityInputs(client,row.organization_id,row.product_membership_id);if(!inputs)return false;
 const same=await client.query(`SELECT source=$4::jsonb AS same FROM public.member_capability_snapshots WHERE organization_id=$1 AND product_membership_id=$2 AND policy_revision=$3`,[row.organization_id,row.product_membership_id,row.revision,inputs.source]);
 return same.rows[0]?.same===true&&matchesStagedCapabilities(row.payload,{...inputs.state,policyRevision:row.revision});
}
async function transaction<T>(url: string, organizationId: OrganizationId, productId: ProductId, run: (client: Client) => Promise<T>): Promise<T> {
  OrganizationIdSchema.parse(organizationId); ProductIdSchema.parse(productId);
  const client = new Client({ connectionString: url }); await client.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query<{ allowed: boolean }>(`SELECT pg_has_role(current_user,'company_human_capability_worker','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT pg_has_role(current_user,'company_human_service','member')
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.capability_jobs'::regclass),'member') AS allowed FROM pg_roles r WHERE rolname=current_user`);
    if (!role.rows[0]?.allowed) throw new Error('Capabilities require a restricted worker role');
    await client.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.product_id',$2,true)", [organizationId, productId]);
    const result = await run(client); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
async function audit(client: Client, organizationId: OrganizationId, row: Row, action: string, state: Record<string, unknown>) {
  await appendServiceAudit(client, { organizationId, serviceId: 'capability-worker', action: `product.capability.${action}`,
    targetType: 'product_membership', targetId: row.product_membership_id, afterState: { revision: row.revision, attemptNumber: row.attempt_count, ...state } });
}
/** Trusted scheduled scope only; stale snapshots are superseded. */
export async function claimCapability(url: string, organizationId: OrganizationId, productId: ProductId): Promise<CapabilityLease | null> {
  return transaction(url, organizationId, productId, async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`capability-worker:${organizationId}:${productId}`]);
    const result = await client.query<Row>(`${selection} WHERE j.organization_id=$1 AND i.product_id=$2
      AND ((j.status IN ('pending','retry_wait') AND j.next_attempt_at<=now()) OR (j.status='running' AND j.lease_expires_at<=now()))
      AND NOT EXISTS (SELECT 1 FROM public.capability_jobs other WHERE other.product_membership_id=j.product_membership_id AND other.revision<>j.revision AND other.status='running' AND other.lease_expires_at>now())
      ORDER BY j.next_attempt_at,j.product_membership_id,j.revision FOR UPDATE OF j SKIP LOCKED LIMIT 1`, [organizationId, productId]);
    let row = result.rows[0]; if (!row) return null;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`capability-snapshot:${row.product_membership_id}`]);
    row = (await client.query<Row>(`${selection} WHERE j.organization_id=$1 AND j.product_membership_id=$2 AND j.revision=$3`, [organizationId,row.product_membership_id,row.revision])).rows[0]!;
    if (row.status === 'running') await client.query(`UPDATE public.capability_attempts SET finished_at=now(),outcome='lease_expired',failure_code='worker_lease_expired'
      WHERE product_membership_id=$1 AND revision=$2 AND attempt_number=$3 AND finished_at IS NULL`, [row.product_membership_id,row.revision,row.attempt_count]);
    const state = stateFor(row), valid = await current(client,row) && state !== null;
    if (!valid || row.attempt_count >= 5) {
      const status = valid ? 'failed' : 'superseded', code = valid ? 'retry_exhausted' : 'superseded_policy';
      await client.query(`UPDATE public.capability_jobs SET status=$3,failure_code=$4,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE product_membership_id=$1 AND revision=$2`, [row.product_membership_id,row.revision,status,code]);
      await audit(client,organizationId,row,valid?'exhausted':'superseded',{status,code}); return null;
    }
    const leaseToken = randomUUID(), attemptNumber = row.attempt_count + 1;
    await client.query(`UPDATE public.capability_jobs SET status='running',attempt_count=$3,lease_token=$4,lease_expires_at=now()+interval '2 minutes',updated_at=now()
      WHERE product_membership_id=$1 AND revision=$2`, [row.product_membership_id,row.revision,attemptNumber,leaseToken]);
    await client.query(`INSERT INTO public.capability_attempts(organization_id,product_membership_id,revision,attempt_number,lease_token) VALUES($1,$2,$3,$4,$5)`, [organizationId,row.product_membership_id,row.revision,attemptNumber,leaseToken]);
    await audit(client,organizationId,{...row,attempt_count:attemptNumber},'claimed',{});
    return { productId, productMembershipId:row.product_membership_id, state: state!, leaseToken, attemptNumber, idempotencyKey: `capability:${row.product_membership_id}:${row.revision}` };
  });
}
export async function finishCapability(url: string, organizationId: OrganizationId, lease: CapabilityLease, rawApply: Receipt, rawReadback: Receipt | null): Promise<void> {
  const expected = StagedCapabilitiesStateSchema.parse(lease.state); ProductMembershipIdSchema.parse(lease.productMembershipId); z.uuid().parse(lease.leaseToken);
  const apply = CapabilityAdapterResultSchema.parse(rawApply), readback = rawReadback === null ? null : CapabilityAdapterResultSchema.parse(rawReadback);
  await transaction(url,organizationId,lease.productId,async client => {
    const result = await client.query<Row>(`${selection} WHERE j.organization_id=$1 AND j.product_membership_id=$2 AND j.revision=$3 FOR UPDATE OF j`, [organizationId,lease.productMembershipId,expected.policyRevision]);
    let row = result.rows[0];
    if (!row || row.status !== 'running' || row.lease_token !== lease.leaseToken || row.expired || row.attempt_count !== lease.attemptNumber) throw new Error('Stale capability lease');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`capability-snapshot:${lease.productMembershipId}`]);
    row = (await client.query<Row>(`${selection} WHERE j.organization_id=$1 AND j.product_membership_id=$2 AND j.revision=$3`, [organizationId,lease.productMembershipId,expected.policyRevision])).rows[0]!;
    if (row.expired) throw new Error('Stale capability lease');
    let receipt: Receipt = apply;
    if (apply.status === 'succeeded') {
      receipt = !matchesStagedCapabilities(expected,apply.value) ? {status:'permanent_failure',code:'provider_capability_mismatch'}
        : readback ?? {status:'permanent_failure',code:'provider_readback_missing'};
      if (receipt.status === 'succeeded' && !matchesStagedCapabilities(expected,receipt.value)) receipt = {status:'permanent_failure',code:'provider_capability_mismatch'};
    }
    const active = await current(client,row) && matchesStagedCapabilities(expected,stateFor(row));
    const retry = receipt.status === 'pending' || receipt.status === 'retryable_failure';
    const status = !active ? 'superseded' : receipt.status === 'succeeded' ? 'succeeded' : retry && row.attempt_count < 5 ? 'retry_wait' : 'failed';
    const code = !active ? 'superseded_policy' : retry && row.attempt_count >= 5 ? 'retry_exhausted' : 'code' in receipt ? receipt.code : null;
    const delay = receipt.status === 'retryable_failure' && receipt.retryAfterSeconds ? receipt.retryAfterSeconds : Math.min(3600,30*2**(row.attempt_count-1));
    await client.query(`UPDATE public.capability_attempts SET finished_at=now(),outcome=$4,failure_code=$5,provider_reference=$6,apply_receipt=$7,readback_receipt=$8
      WHERE product_membership_id=$1 AND revision=$2 AND attempt_number=$3`, [row.product_membership_id,row.revision,row.attempt_count,receipt.status,'code' in receipt?receipt.code:null,
      receipt.status==='pending'?receipt.operationId:null,JSON.stringify(apply),readback===null?null:JSON.stringify(readback)]);
    await client.query(`UPDATE public.capability_jobs SET status=$3,failure_code=$4,lease_token=NULL,lease_expires_at=NULL,next_attempt_at=now()+($5*interval '1 second'),updated_at=now()
      WHERE product_membership_id=$1 AND revision=$2`, [row.product_membership_id,row.revision,status,code,delay]);
    await audit(client,organizationId,row,'received',{status,outcome:receipt.status,code});
  });
}
/** Stage then observe provider state. Never resumes a member or treats a receipt as a full authorization. */
export async function dispatchCapability(url: string, organizationId: OrganizationId, registration: { productId: ProductId; adapter: ProductCapabilityAdapterV1 }): Promise<'idle'|'processed'> {
  assertProductCapabilityAdapterV1(registration.adapter);
  const lease = await claimCapability(url,organizationId,registration.productId); if (!lease) return 'idle';
  let apply: Receipt = {status:'retryable_failure',code:'adapter_transport_failure'}, readback: Receipt | null = null;
  const deadline=performance.now()+60000;
  const bounded=async<T>(operation:Promise<T>):Promise<T>=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Adapter deadline exceeded')),Math.max(1,deadline-performance.now()));})]);}
    finally{if(timer)clearTimeout(timer);}
  };
  const parse = (value: unknown): Receipt => { const result = CapabilityAdapterResultSchema.safeParse(value); return result.success ? result.data : {status:'permanent_failure',code:'invalid_adapter_response'}; };
  try {
    apply=parse(await bounded(registration.adapter.stageCapabilities({...lease.state,idempotencyKey:lease.idempotencyKey})));
    if(apply.status==='succeeded'&&matchesStagedCapabilities(lease.state,apply.value)){
      try{readback=parse(await bounded(registration.adapter.getStagedCapabilities(lease.state)));}
      catch{readback={status:'retryable_failure',code:'adapter_transport_failure'};}
    }
  }catch{ /* Preserve a completed apply if readback times out; late promises cannot rewrite these receipts. */ }
  await finishCapability(url,organizationId,lease,apply,readback);return 'processed';
}
