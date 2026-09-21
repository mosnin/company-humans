import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";
import { OrganizationIdSchema, ProductIdSchema, UsageLimitIdSchema, AppliedUsageLimitStateSchema, UsageLimitAdapterResultSchema,
  ProductCatalogMetadataV1Schema, assertProductUsageLimitAdapterV1, matchesAppliedUsageLimit,
  type OrganizationId, type ProductId, type AppliedUsageLimitState, type ProductUsageLimitAdapterV1 } from "@company-human/contracts";
import { appendServiceAudit } from "./identity-audit.js";
type Receipt = z.infer<typeof UsageLimitAdapterResultSchema>;
interface Row {
  organization_id: string; usage_limit_id: string; revision: number; status: string; attempt_count: number;
  lease_token: string | null; expired: boolean; latest: boolean; eligible: boolean;
  product_instance_id: string; membership_id: string | null; meter_key: string; unit: string; window_key: string; maximum_quantity: string;
  external_organization_id: string | null; external_member_id: string | null; catalog_metadata: unknown;
}
export interface UsageLimitLease { productId: ProductId; state: AppliedUsageLimitState; leaseToken: string; attemptNumber: number; idempotencyKey: string; }
const selection = `SELECT j.*,j.lease_expires_at<=clock_timestamp() AS expired,l.product_instance_id,l.membership_id,l.meter_key,l.unit,l.window_key,
  r.maximum_quantity,i.external_organization_id,pm.external_member_id,p.catalog_metadata,
  NOT EXISTS (SELECT 1 FROM public.product_usage_limit_revisions newer WHERE newer.usage_limit_id=l.id AND newer.revision>j.revision) AS latest,
  (r.maximum_quantity=0 OR (o.status='active' AND i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status<>'retired'
    AND (l.membership_id IS NULL OR (m.status='active' AND u.status='active' AND pm.desired_enabled AND pm.provisioning_status IN ('active','suspended'))))) AS eligible
  FROM public.usage_limit_jobs j JOIN public.product_usage_limits l ON l.organization_id=j.organization_id AND l.id=j.usage_limit_id
  JOIN public.product_usage_limit_revisions r ON r.organization_id=j.organization_id AND r.usage_limit_id=j.usage_limit_id AND r.revision=j.revision
  JOIN public.product_instances i ON i.organization_id=l.organization_id AND i.id=l.product_instance_id
  JOIN public.products p ON p.id=i.product_id JOIN public.organizations o ON o.id=l.organization_id
  LEFT JOIN public.product_memberships pm ON pm.organization_id=l.organization_id AND pm.product_instance_id=l.product_instance_id AND pm.membership_id=l.membership_id
  LEFT JOIN public.memberships m ON m.organization_id=l.organization_id AND m.id=l.membership_id
  LEFT JOIN public.users u ON u.id=m.user_id`;
function stateFor(row: Row): AppliedUsageLimitState | null {
  const parsed = AppliedUsageLimitStateSchema.safeParse({ schemaVersion: 1,
    limit: { schemaVersion: 1, usageLimitId: row.usage_limit_id, organizationId: row.organization_id, productInstanceId: row.product_instance_id,
      membershipId: row.membership_id, meterKey: row.meter_key, unit: row.unit, window: row.window_key, revision: row.revision, maximumQuantity: row.maximum_quantity },
    target: { externalOrganizationId: row.external_organization_id, externalMemberId: row.membership_id === null ? null : row.external_member_id },
    enforcement: 'hard_stop', accounting: 'preserve_accumulated_usage', scope: row.membership_id === null ? 'organization_aggregate' : 'member' });
  return parsed.success ? parsed.data : null;
}
function current(row: Row): boolean {
  if (!row.latest || !row.eligible) return false;
  if (Number(row.maximum_quantity) === 0) return true;
  const catalog = ProductCatalogMetadataV1Schema.safeParse(row.catalog_metadata);
  return catalog.success && catalog.data.usageMeters.includes(row.meter_key);
}
async function transaction<T>(url: string, organizationId: OrganizationId, productId: ProductId, run: (client: Client) => Promise<T>): Promise<T> {
  OrganizationIdSchema.parse(organizationId); ProductIdSchema.parse(productId);
  const client = new Client({ connectionString: url }); await client.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query<{ allowed: boolean }>(`SELECT pg_has_role(current_user,'company_human_limit_worker','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT pg_has_role(current_user,'company_human_service','member')
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.usage_limit_jobs'::regclass),'member') AS allowed FROM pg_roles r WHERE rolname=current_user`);
    if (!role.rows[0]?.allowed) throw new Error('Usage limits require a restricted worker role');
    await client.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.product_id',$2,true)", [organizationId, productId]);
    const result = await run(client); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
async function audit(client: Client, organizationId: OrganizationId, row: Row, action: string, state: Record<string, unknown>) {
  await appendServiceAudit(client, { organizationId, serviceId: 'usage-limit-worker', action: `product.usage_limit.${action}`,
    targetType: 'usage_limit', targetId: row.usage_limit_id, afterState: { revision: row.revision, attemptNumber: row.attempt_count, ...state } });
}
/** Trusted scheduled scope only; unavailable provider bindings remain pending. */
export async function claimUsageLimit(url: string, organizationId: OrganizationId, productId: ProductId): Promise<UsageLimitLease | null> {
  return transaction(url, organizationId, productId, async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`usage-limit-worker:${organizationId}:${productId}`]);
    const result = await client.query<Row>(`${selection} WHERE j.organization_id=$1 AND i.product_id=$2
      AND ((j.status IN ('pending','retry_wait') AND j.next_attempt_at<=now()) OR (j.status='running' AND j.lease_expires_at<=now()))
      AND i.external_organization_id IS NOT NULL AND (l.membership_id IS NULL OR pm.external_member_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM public.usage_limit_jobs other WHERE other.usage_limit_id=j.usage_limit_id AND other.revision<>j.revision AND other.status='running' AND other.lease_expires_at>now())
      ORDER BY j.next_attempt_at,j.usage_limit_id,j.revision FOR UPDATE OF j SKIP LOCKED LIMIT 1`, [organizationId, productId]);
    let row = result.rows[0]; if (!row) return null;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`usage-limit-revision:${row.usage_limit_id}`]);
    row = (await client.query<Row>(`${selection} WHERE j.organization_id=$1 AND j.usage_limit_id=$2 AND j.revision=$3`, [organizationId,row.usage_limit_id,row.revision])).rows[0]!;
    if (row.status === 'running') await client.query(`UPDATE public.usage_limit_attempts SET finished_at=now(),outcome='lease_expired',failure_code='worker_lease_expired'
      WHERE usage_limit_id=$1 AND revision=$2 AND attempt_number=$3 AND finished_at IS NULL`, [row.usage_limit_id,row.revision,row.attempt_count]);
    const state = stateFor(row), valid = current(row) && state !== null;
    if (!valid || row.attempt_count >= 5) {
      const status = valid ? 'failed' : 'superseded', code = valid ? 'retry_exhausted' : 'superseded_policy';
      await client.query(`UPDATE public.usage_limit_jobs SET status=$3,failure_code=$4,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE usage_limit_id=$1 AND revision=$2`, [row.usage_limit_id,row.revision,status,code]);
      await audit(client,organizationId,row,valid?'exhausted':'superseded',{status,code}); return null;
    }
    const leaseToken = randomUUID(), attemptNumber = row.attempt_count + 1;
    await client.query(`UPDATE public.usage_limit_jobs SET status='running',attempt_count=$3,lease_token=$4,lease_expires_at=now()+interval '2 minutes',updated_at=now()
      WHERE usage_limit_id=$1 AND revision=$2`, [row.usage_limit_id,row.revision,attemptNumber,leaseToken]);
    await client.query(`INSERT INTO public.usage_limit_attempts(organization_id,usage_limit_id,revision,attempt_number,lease_token) VALUES($1,$2,$3,$4,$5)`, [organizationId,row.usage_limit_id,row.revision,attemptNumber,leaseToken]);
    await audit(client,organizationId,{...row,attempt_count:attemptNumber},'claimed',{});
    return { productId, state: state!, leaseToken, attemptNumber, idempotencyKey: `usage-limit:${row.usage_limit_id}:${row.revision}` };
  });
}
export async function finishUsageLimit(url: string, organizationId: OrganizationId, lease: UsageLimitLease, rawApply: Receipt, rawReadback: Receipt | null): Promise<void> {
  const expected = AppliedUsageLimitStateSchema.parse(lease.state); UsageLimitIdSchema.parse(expected.limit.usageLimitId); z.uuid().parse(lease.leaseToken);
  const apply = UsageLimitAdapterResultSchema.parse(rawApply), readback = rawReadback === null ? null : UsageLimitAdapterResultSchema.parse(rawReadback);
  await transaction(url,organizationId,lease.productId,async client => {
    const result = await client.query<Row>(`${selection} WHERE j.organization_id=$1 AND j.usage_limit_id=$2 AND j.revision=$3 FOR UPDATE OF j`, [organizationId,expected.limit.usageLimitId,expected.limit.revision]);
    let row = result.rows[0];
    if (!row || row.status !== 'running' || row.lease_token !== lease.leaseToken || row.expired || row.attempt_count !== lease.attemptNumber) throw new Error('Stale usage limit lease');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`usage-limit-revision:${expected.limit.usageLimitId}`]);
    row = (await client.query<Row>(`${selection} WHERE j.organization_id=$1 AND j.usage_limit_id=$2 AND j.revision=$3`, [organizationId,expected.limit.usageLimitId,expected.limit.revision])).rows[0]!;
    if (row.expired) throw new Error('Stale usage limit lease');
    let receipt: Receipt = apply;
    if (apply.status === 'succeeded') {
      receipt = !matchesAppliedUsageLimit(expected,apply.value) ? {status:'permanent_failure',code:'provider_limit_mismatch'}
        : readback ?? {status:'permanent_failure',code:'provider_readback_missing'};
      if (receipt.status === 'succeeded' && !matchesAppliedUsageLimit(expected,receipt.value)) receipt = {status:'permanent_failure',code:'provider_limit_mismatch'};
    }
    const active = current(row) && matchesAppliedUsageLimit(expected,stateFor(row));
    const retry = receipt.status === 'pending' || receipt.status === 'retryable_failure';
    const status = !active ? 'superseded' : receipt.status === 'succeeded' ? 'succeeded' : retry && row.attempt_count < 5 ? 'retry_wait' : 'failed';
    const code = !active ? 'superseded_policy' : retry && row.attempt_count >= 5 ? 'retry_exhausted' : 'code' in receipt ? receipt.code : null;
    const delay = receipt.status === 'retryable_failure' && receipt.retryAfterSeconds ? receipt.retryAfterSeconds : Math.min(3600,30*2**(row.attempt_count-1));
    await client.query(`UPDATE public.usage_limit_attempts SET finished_at=now(),outcome=$4,failure_code=$5,provider_reference=$6,apply_receipt=$7,readback_receipt=$8
      WHERE usage_limit_id=$1 AND revision=$2 AND attempt_number=$3`, [row.usage_limit_id,row.revision,row.attempt_count,receipt.status,'code' in receipt?receipt.code:null,
      receipt.status==='pending'?receipt.operationId:null,JSON.stringify(apply),readback===null?null:JSON.stringify(readback)]);
    await client.query(`UPDATE public.usage_limit_jobs SET status=$3,failure_code=$4,lease_token=NULL,lease_expires_at=NULL,next_attempt_at=now()+($5*interval '1 second'),updated_at=now()
      WHERE usage_limit_id=$1 AND revision=$2`, [row.usage_limit_id,row.revision,status,code,delay]);
    await audit(client,organizationId,row,'received',{status,outcome:receipt.status,code});
  });
}
/** Apply then observe provider state. Never resumes a member or treats a receipt as a full authorization. */
export async function dispatchUsageLimit(url: string, organizationId: OrganizationId, registration: { productId: ProductId; adapter: ProductUsageLimitAdapterV1 }): Promise<'idle'|'processed'> {
  assertProductUsageLimitAdapterV1(registration.adapter);
  const lease = await claimUsageLimit(url,organizationId,registration.productId); if (!lease) return 'idle';
  let apply: Receipt = {status:'retryable_failure',code:'adapter_transport_failure'}, readback: Receipt | null = null;
  const deadline=performance.now()+60000;
  const bounded=async<T>(operation:Promise<T>):Promise<T>=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Adapter deadline exceeded')),Math.max(1,deadline-performance.now()));})]);}
    finally{if(timer)clearTimeout(timer);}
  };
  const parse = (value: unknown): Receipt => { const result = UsageLimitAdapterResultSchema.safeParse(value); return result.success ? result.data : {status:'permanent_failure',code:'invalid_adapter_response'}; };
  try {
    apply=parse(await bounded(registration.adapter.applyUsageLimit({...lease.state,idempotencyKey:lease.idempotencyKey})));
    if(apply.status==='succeeded'&&matchesAppliedUsageLimit(lease.state,apply.value)){
      try{readback=parse(await bounded(registration.adapter.getUsageLimitState(lease.state)));}
      catch{readback={status:'retryable_failure',code:'adapter_transport_failure'};}
    }
  }catch{ /* Preserve completed apply receipts; late promises cannot rewrite the recorded outcome. */ }
  await finishUsageLimit(url,organizationId,lease,apply,readback);return 'processed';
}
