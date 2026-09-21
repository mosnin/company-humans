import { assertProductAdapterV1, ProductIdSchema, ProductInstanceIdSchema, type ProductAdapterV1, type ProductId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { claimProvisioningOperation, finishProvisioningAttempt, type ProvisioningScope } from "./provisioning-operations.js";

const Response = z.discriminatedUnion("status", [
  z.object({ status: z.literal("succeeded"), value: z.object({ externalOrganizationId: z.string().min(1).max(256),
    status: z.enum(["active", "suspended", "disconnected"]) }).strict() }).strict(),
  z.object({ status: z.literal("pending"), operationId: z.string().min(1).max(256) }).strict(),
  z.object({ status: z.literal("retryable_failure"), code: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/), retryAfterSeconds: z.number().int().min(1).max(86400).optional() }).strict(),
  z.object({ status: z.literal("permanent_failure"), code: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/) }).strict(),
]);

/** One bounded server-side operation. Registration must come from trusted server configuration, never request data. */
export async function dispatchProvisioningOperation(databaseUrl: string, scope: ProvisioningScope,
  registration: { productId: ProductId; adapter: ProductAdapterV1 }): Promise<"idle" | "processed"> {
  ProductIdSchema.parse(registration.productId);
  assertProductAdapterV1(registration.adapter);
  // Validate the execution credential before claiming or contacting any external system.
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const role = await client.query<{ allowed: boolean }>(`SELECT pg_has_role(current_user,'company_human_provisioner','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid = 'public.product_instances'::regclass),'member') AS allowed
      FROM pg_roles r WHERE rolname = current_user`);
    if (!role.rows[0]?.allowed) throw new Error("Provisioning requires a restricted provisioner role");
  } finally { await client.end(); }
  const lease = await claimProvisioningOperation(databaseUrl, scope, registration.productId);
  if (!lease) return "idle";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: z.infer<typeof Response>;
  try {
    const raw = await Promise.race([
      registration.adapter.provisionOrganization({ organizationId: scope.organizationId,
        productInstanceId: ProductInstanceIdSchema.parse(lease.productInstanceId), idempotencyKey: lease.idempotencyKey }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Adapter deadline exceeded")), 60_000); }),
    ]);
    const parsed = Response.safeParse(raw);
    response = parsed.success ? parsed.data : { status: "permanent_failure", code: "invalid_adapter_response" };
  } catch {
    // Provider errors may contain credentials. Persist only this controlled code.
    // A timeout does not cancel remote side effects: the next invocation keeps the same idempotency key.
    response = { status: "retryable_failure", code: "adapter_transport_failure" };
  } finally { if (timer) clearTimeout(timer); }
  if (response.status === "succeeded") {
    if (response.value.status !== "active") {
      await finishProvisioningAttempt(databaseUrl, scope, lease.operationId, lease.leaseToken,
        { status: "permanent_failure", code: "provider_organization_not_active" });
    } else {
      await finishProvisioningAttempt(databaseUrl, scope, lease.operationId, lease.leaseToken,
        { status: "succeeded", providerReference: response.value.externalOrganizationId }, { activateInstance: true });
    }
  } else if (response.status === "pending") {
    await finishProvisioningAttempt(databaseUrl, scope, lease.operationId, lease.leaseToken,
      { status: "pending", providerReference: response.operationId });
  } else {
    await finishProvisioningAttempt(databaseUrl, scope, lease.operationId, lease.leaseToken, response);
  }
  return "processed";
}
