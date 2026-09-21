import { randomUUID } from "node:crypto";
import { OrganizationIdSchema, UserIdSchema, ProvisioningOperationIdSchema, ProductIdSchema, type ProductId, type OrganizationId, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { appendIdentityAudit } from "./identity-audit.js";
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
  id: string; product_instance_id: string; idempotency_key: string; status: string;
  attempt_count: number; lease_token: string | null; lease_expired: boolean;
}
export interface ProvisioningLease {
  operation: "provisionOrganization" | "connectOrganization"; requestedExternalOrganizationId: string | null;
  operationId: string; productInstanceId: string; idempotencyKey: string;
  leaseToken: string; attemptNumber: number;
}

async function transaction<T>(url: string, scope: ProvisioningScope, run: (client: Client) => Promise<T>): Promise<T> {
  UserIdSchema.parse(scope.actorUserId);
  OrganizationIdSchema.parse(scope.organizationId);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    const worker = await client.query<{ allowed: boolean }>(`SELECT pg_has_role(current_user,'company_human_provisioner','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls
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
    if (!permission.rows[0]?.allowed) throw new Error("Application administration denied");
    const value = await run(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}

/** Server-only: obtain one tenant-scoped lease; callers must not expose this as an unauthenticated worker API. */
export async function claimProvisioningOperation(url: string, scope: ProvisioningScope, productId?: ProductId): Promise<ProvisioningLease | null> {
  if (productId !== undefined) ProductIdSchema.parse(productId);
  return transaction(url, scope, async (client) => {
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
      await appendIdentityAudit(client, { ...scope, action: "product.provisioning.exhausted", targetType: "provisioning_operation",
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
    await appendIdentityAudit(client, { ...scope, action: "product.provisioning.claimed", targetType: "provisioning_operation",
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
  await transaction(url, scope, async (client) => {
    const selected = await client.query<OperationRow>(`SELECT *, lease_expires_at <= clock_timestamp() AS lease_expired
      FROM public.provisioning_operations WHERE id = $1 AND organization_id = $2 FOR UPDATE`, [operationId, scope.organizationId]);
    const row = selected.rows[0];
    if (!row || row.status !== "running" || row.lease_token !== leaseToken || row.lease_expired) throw new Error("Stale provisioning lease");
    if (options.activateInstance) {
      if (parsed.status !== "succeeded") throw new Error("Only successful provisioning can activate an instance");
      await client.query(row.operation==="connectOrganization"?"SELECT company_human_private.activate_connected_instance($1,$2,$3)":"SELECT company_human_private.activate_provisioned_instance($1,$2,$3)",
        [row.id, leaseToken, parsed.providerReference]);
    }
    const retryable = parsed.status === "pending" || parsed.status === "retryable_failure";
    const exhausted = retryable && row.attempt_count >= 5;
    const status = parsed.status === "succeeded" ? "succeeded" : retryable && !exhausted ? "retry_wait" : "failed";
    const code = exhausted ? "retry_exhausted" : "code" in parsed ? parsed.code : null;
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
    await appendIdentityAudit(client, { ...scope, action: "product.provisioning.received", targetType: "provisioning_operation",
      targetId: row.id, afterState: { status, outcome: parsed.status, attemptNumber: row.attempt_count, code, instanceActivated: options.activateInstance === true } });
  });
}
