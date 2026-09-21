import { randomUUID } from "node:crypto";
import { OrganizationIdSchema, UserIdSchema, ProvisioningOperationIdSchema, ProductIdSchema, type ProductId, type OrganizationId, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { appendIdentityAudit, appendServiceAudit } from "./identity-audit.js";
import { setServiceContext } from "./service-context.js";

const Reference = z.string().min(1).max(256);
const Code = z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/);
const Result = z.discriminatedUnion("status", [
  z.object({ status: z.literal("succeeded"), providerReference: Reference }).strict(),
  z.object({ status: z.literal("pending"), providerReference: Reference }).strict(),
  z.object({ status: z.literal("retryable_failure"), code: Code, retryAfterSeconds: z.number().int().min(1).max(86400).optional() }).strict(),
  z.object({ status: z.literal("permanent_failure"), code: Code }).strict(),
]);
export interface ProvisioningScope { actorUserId: UserId; organizationId: OrganizationId }
interface OperationRow {
  operation: "provisionOrganization" | "connectOrganization"; requested_external_organization_id: string | null;
  initiating_user_id?: string;
  id: string; product_instance_id: string; idempotency_key: string; status: string;
  attempt_count: number; lease_token: string | null; lease_expired: boolean;
}
export interface ProvisioningLease {
  operation: "provisionOrganization" | "connectOrganization"; requestedExternalOrganizationId: string | null;
  operationId: string; productInstanceId: string; idempotencyKey: string;
  leaseToken: string; attemptNumber: number;
}

async function transaction<T>(url: string, scope: ProvisioningScope, run: (client: Client, worker: boolean, authorized: boolean) => Promise<T>, retainReceipt = false): Promise<T> {
  UserIdSchema.parse(scope.actorUserId);
  OrganizationIdSchema.parse(scope.organizationId);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    const worker = await client.query<{ allowed: boolean }>(`SELECT pg_has_role(current_user,'company_human_provisioner','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND NOT pg_has_role(current_user,'company_human_service','member')
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid = 'public.product_instances'::regclass),'member') AS allowed
      FROM pg_roles r WHERE rolname = current_user`);
    if (worker.rows[0]?.allowed) {
      await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
        [scope.actorUserId, scope.organizationId]);
    } else {
      await setServiceContext(client, scope.actorUserId, scope.organizationId);
    }
    const permission = await client.query<{ allowed: boolean }>(
      "SELECT company_human_private.has_capability($1,'applications.manage') AS allowed", [scope.organizationId]);
    const isWorker=worker.rows[0]?.allowed===true,authorized=permission.rows[0]?.allowed===true;
    if (!authorized && !(retainReceipt && isWorker)) throw new Error("Application administration denied");
    const value = await run(client,isWorker,authorized);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}

async function appendProvisioningAudit(client:Client,scope:ProvisioningScope,worker:boolean,change:{action:string;targetId:string;afterState:Record<string,unknown>}) {
  if(worker) await appendServiceAudit(client,{organizationId:scope.organizationId,serviceId:'organization-provisioner',targetType:'provisioning_operation',
    ...change,afterState:{...change.afterState,initiatingUserId:scope.actorUserId}});
  else await appendIdentityAudit(client,{...scope,targetType:'provisioning_operation',...change});
}

/** Server-only: obtain one tenant-scoped lease; callers must not expose this as an unauthenticated worker API. */
export async function claimProvisioningOperation(url: string, scope: ProvisioningScope, productId?: ProductId): Promise<ProvisioningLease | null> {
  if (productId !== undefined) ProductIdSchema.parse(productId);
  return transaction(url, scope, async (client,worker) => {
    const selected = await client.query<OperationRow>(
      `SELECT o.*, o.lease_expires_at <= clock_timestamp() AS lease_expired FROM public.provisioning_operations o
       JOIN public.product_instances i ON i.organization_id = o.organization_id AND i.id = o.product_instance_id
       WHERE o.organization_id = $1 AND ($2::text IS NULL OR i.product_id = $2) AND i.desired_enabled AND ((i.mode='provisioned' AND o.operation='provisionOrganization') OR (i.mode='connected' AND o.operation='connectOrganization')) AND i.provisioning_status = 'pending'
         AND ((o.status IN ('pending','retry_wait') AND o.next_attempt_at <= now())
           OR (o.status = 'running' AND o.lease_expires_at <= now()))
       ORDER BY o.next_attempt_at, o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1`, [scope.organizationId, productId ?? null]);
    const row = selected.rows[0];
    if (!row) return null;
    if (row.status === "running") {
      await client.query(`UPDATE public.provisioning_attempts SET finished_at = now(), outcome = 'lease_expired',
        failure_code = 'worker_lease_expired' WHERE operation_id = $1 AND attempt_number = $2 AND finished_at IS NULL`,
      [row.id, row.attempt_count]);
    }
    if (row.attempt_count >= 5) {
      await client.query(`UPDATE public.provisioning_operations SET status = 'failed', failure_code = 'retry_exhausted',
        lease_token = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = $1`, [row.id]);
      await appendProvisioningAudit(client, scope,worker, { action: "product.provisioning.exhausted",
        targetId: row.id, afterState: { status: "failed", code: "retry_exhausted" } });
      return null;
    }
    const leaseToken = randomUUID();
    const attemptNumber = row.attempt_count + 1;
    await client.query(`UPDATE public.provisioning_operations SET status = 'running', attempt_count = $2,
      lease_token = $3, lease_expires_at = now() + interval '2 minutes', updated_at = now() WHERE id = $1`,
    [row.id, attemptNumber, leaseToken]);
    await client.query(`INSERT INTO public.provisioning_attempts
      (organization_id,operation_id,attempt_number,lease_token,actor_user_id) VALUES ($1,$2,$3,$4,$5)`,
    [scope.organizationId, row.id, attemptNumber, leaseToken, scope.actorUserId]);
    await appendProvisioningAudit(client, scope,worker, { action: "product.provisioning.claimed",
      targetId: row.id, afterState: { attemptNumber } });
    return { operation:row.operation,requestedExternalOrganizationId:row.requested_external_organization_id,operationId: row.id, productInstanceId: row.product_instance_id, idempotencyKey: row.idempotency_key, leaseToken, attemptNumber };
  });
}

/** Persist a normalized adapter receipt, never arbitrary provider payloads or credentials. Activation requires a separate restricted provisioner credential and is atomic with its receipt. */
export async function finishProvisioningAttempt(url: string, scope: ProvisioningScope, operationId: string, leaseToken: string,
  result: z.input<typeof Result>, options: { activateInstance?: boolean } = {}): Promise<void> {
  ProvisioningOperationIdSchema.parse(operationId);
  z.string().uuid().parse(leaseToken);
  const parsed = Result.parse(result);
  await transaction(url, scope, async (client,worker,authorized) => {
    const selected = await client.query<OperationRow>(`SELECT o.*,a.actor_user_id AS initiating_user_id,o.lease_expires_at <= clock_timestamp() AS lease_expired
      FROM public.provisioning_operations o JOIN public.provisioning_attempts a ON a.operation_id=o.id AND a.organization_id=o.organization_id
        AND a.attempt_number=o.attempt_count AND a.lease_token=o.lease_token
      WHERE o.id = $1 AND o.organization_id = $2 FOR UPDATE OF o`, [operationId, scope.organizationId]);
    const row = selected.rows[0];
    if (!row || row.status !== "running" || row.lease_token !== leaseToken || row.lease_expired || row.initiating_user_id !== scope.actorUserId) throw new Error("Stale provisioning lease");
    const instance=await client.query<{desired_enabled:boolean}>("SELECT desired_enabled FROM public.product_instances WHERE organization_id=$1 AND id=$2",[scope.organizationId,row.product_instance_id]);
    let activationDenied=!authorized||!instance.rows[0]?.desired_enabled,instanceActivated=false;
    if (options.activateInstance) {
      if (parsed.status !== "succeeded") throw new Error("Only successful provisioning can activate an instance");
      if (!activationDenied) {
        await client.query('SAVEPOINT provider_activation');
        try {
          await client.query(row.operation==="connectOrganization"?"SELECT company_human_private.activate_connected_instance($1,$2,$3)":"SELECT company_human_private.activate_provisioned_instance($1,$2,$3)",
            [row.id, leaseToken, parsed.providerReference]);
          instanceActivated=true;
        } catch(error) {
          if(!worker || !(error instanceof Error) || !('code' in error) || error.code!=='42501'
            || !/activation (denied|no longer allowed)/.test(error.message)) throw error;
          await client.query('ROLLBACK TO SAVEPOINT provider_activation');activationDenied=true;
        }
        await client.query('RELEASE SAVEPOINT provider_activation');
      }
    }
    const retryable = parsed.status === "pending" || parsed.status === "retryable_failure";
    const exhausted = retryable && row.attempt_count >= 5;
    const status = activationDenied ? "failed" : parsed.status === "succeeded" ? "succeeded" : retryable && !exhausted ? "retry_wait" : "failed";
    const code = activationDenied ? "activation_denied_reconciliation_required" : exhausted ? "retry_exhausted" : "code" in parsed ? parsed.code : null;
    const reference = "providerReference" in parsed ? parsed.providerReference : null;
    const delay = parsed.status === "retryable_failure" && parsed.retryAfterSeconds
      ? parsed.retryAfterSeconds : Math.min(3600, 30 * 2 ** (row.attempt_count - 1));
    await client.query(`UPDATE public.provisioning_attempts SET finished_at = now(), outcome = $3,
      failure_code = $4, provider_reference = $5 WHERE operation_id = $1 AND attempt_number = $2`,
    [row.id, row.attempt_count, parsed.status, "code" in parsed ? parsed.code : null, reference]);
    await client.query(`UPDATE public.provisioning_operations SET status = $2, failure_code = $3,
      provider_reference = coalesce($4,provider_reference), lease_token = NULL, lease_expires_at = NULL,
      next_attempt_at = now() + ($5 * interval '1 second'), updated_at = now() WHERE id = $1`,
    [row.id, status, code, reference, delay]);
    await appendProvisioningAudit(client, scope,worker, { action: "product.provisioning.received",
      targetId: row.id, afterState: { status, outcome: parsed.status, attemptNumber: row.attempt_count, code, instanceActivated } });
  },true);
}
