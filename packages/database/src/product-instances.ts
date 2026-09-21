import { createCanonicalId, MembershipIdSchema, OrganizationIdSchema, ProductIdSchema, ProductInstanceIdSchema, ProvisioningModeSchema, UserIdSchema, type OrganizationId, type ProductId, type ProductInstanceId, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { appendIdentityAudit } from "./identity-audit.js";
import { setServiceContext } from "./service-context.js";

const EnableSchema = z.object({
  actorUserId: UserIdSchema,
  organizationId: OrganizationIdSchema,
  productId: ProductIdSchema,
  instanceKey: z.string().regex(/^[a-z][a-z0-9-]*$/).default("primary"),
  mode: ProvisioningModeSchema,
}).strict();

/** Records intent to enable. Only an adapter may later set status active. */
export async function enableProductInstance(databaseUrl: string, input: z.input<typeof EnableSchema>): Promise<ProductInstanceId> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const parsed = EnableSchema.parse(input);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    const actor = await client.query<{ id: string }>(
      `SELECT m.id FROM public.memberships AS m JOIN public.organizations AS o ON o.id = m.organization_id
       WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active'
         AND o.status = 'active'
       AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = m.user_id AND u.status = 'active')
       AND EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.organization_id = m.organization_id
         AND rp.role_id = m.role_id AND rp.permission_key = 'applications.manage')`,
      [parsed.organizationId, parsed.actorUserId],
    );
    if (actor.rowCount !== 1) throw new Error("Application administration denied");
    const product = await client.query<{ catalog_status: string }>(
      "SELECT catalog_status FROM public.products WHERE id = $1", [parsed.productId],
    );
    if (!product.rows[0] || product.rows[0].catalog_status === "retired") throw new Error("Product unavailable");
    // A row lock cannot serialize the first insert because no row exists yet.
    // Lock this tenant/product/key through commit, including its audit event.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      JSON.stringify([parsed.organizationId, parsed.productId, parsed.instanceKey]),
    ]);
    const existing = await client.query<{ id: string; mode: string; desired_enabled: boolean }>(
      `SELECT id, mode, desired_enabled FROM public.product_instances
       WHERE organization_id = $1 AND product_id = $2 AND instance_key = $3 FOR UPDATE`,
      [parsed.organizationId, parsed.productId, parsed.instanceKey],
    );
    let instanceId: ProductInstanceId;
    if (existing.rows[0]) {
      if (existing.rows[0].mode !== parsed.mode) throw new Error("Instance mode cannot change during enable");
      instanceId = ProductInstanceIdSchema.parse(existing.rows[0].id);
      if (!existing.rows[0].desired_enabled) {
        await client.query(
          `UPDATE public.product_instances SET desired_enabled = true, provisioning_status = 'pending', updated_at = now()
           WHERE id = $1`, [instanceId],
        );
        await appendIdentityAudit(client, {
          organizationId: parsed.organizationId, actorUserId: parsed.actorUserId,
          actorMembershipId: MembershipIdSchema.parse(actor.rows[0]!.id),
          action: "product.instance.enabled", targetType: "product_instance", targetId: instanceId,
          beforeState: { desiredEnabled: false }, afterState: { desiredEnabled: true, provisioningStatus: "pending" },
        });
      }
    } else {
      instanceId = createCanonicalId("productInstance");
      await client.query(
        `INSERT INTO public.product_instances
         (id, organization_id, product_id, instance_key, mode, desired_enabled, provisioning_status, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, true, 'pending', $6)`,
        [instanceId, parsed.organizationId, parsed.productId, parsed.instanceKey, parsed.mode, parsed.actorUserId],
      );
      await appendIdentityAudit(client, {
        organizationId: parsed.organizationId, actorUserId: parsed.actorUserId,
        actorMembershipId: MembershipIdSchema.parse(actor.rows[0]!.id),
        action: "product.instance.enabled", targetType: "product_instance", targetId: instanceId,
        afterState: { productId: parsed.productId, instanceKey: parsed.instanceKey, mode: parsed.mode,
          desiredEnabled: true, provisioningStatus: "pending" },
      });
    }
    if (parsed.mode === "provisioned") {
      await client.query(`INSERT INTO public.provisioning_operations
        (id,organization_id,product_instance_id,operation,idempotency_key)
        VALUES ($1,$2,$3,'provisionOrganization',$4)
        ON CONFLICT (organization_id,product_instance_id,operation) DO NOTHING`,
      [createCanonicalId("provisioningOperation"), parsed.organizationId, instanceId, `${instanceId}:provision:v1`]);
    }
    await client.query("COMMIT");
    return instanceId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export interface ProductInstanceSummary {
  id: ProductInstanceId;
  organizationId: OrganizationId;
  productId: ProductId;
  productName: string;
  instanceKey: string;
  mode: string;
  desiredEnabled: boolean;
  provisioningStatus: string;
}

/** The restricted database role enforces tenant visibility for this read. */
export async function listProductInstances(databaseUrl: string, userId: UserId, organizationId: OrganizationId): Promise<ProductInstanceSummary[]> {
  UserIdSchema.parse(userId);
  OrganizationIdSchema.parse(organizationId);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const role = await client.query<{ rolsuper: boolean; rolbypassrls: boolean; owns_table: boolean }>(
      `SELECT r.rolsuper, r.rolbypassrls,
        (SELECT pg_has_role(current_user, c.relowner, 'member') FROM pg_class c WHERE c.oid = 'public.product_instances'::regclass) AS owns_table
       FROM pg_roles r WHERE r.rolname = current_user`,
    );
    if (!role.rows[0] || role.rows[0].rolsuper || role.rows[0].rolbypassrls || role.rows[0].owns_table) {
      throw new Error("Tenant query requires a nonprivileged RLS role");
    }
    await client.query("SELECT set_config('company_human.user_id', $1, true)", [userId]);
    const result = await client.query<{
      id: string; organization_id: string; product_id: string; display_name: string;
      instance_key: string; mode: string; desired_enabled: boolean; provisioning_status: string;
    }>(
      `SELECT i.id, i.organization_id, i.product_id, p.display_name, i.instance_key, i.mode,
         i.desired_enabled, i.provisioning_status
       FROM public.product_instances AS i JOIN public.products AS p ON p.id = i.product_id
       WHERE i.organization_id = $1 ORDER BY p.display_name, i.instance_key`,
      [organizationId],
    );
    await client.query("COMMIT");
    return result.rows.map((row) => ({
      id: ProductInstanceIdSchema.parse(row.id), organizationId: OrganizationIdSchema.parse(row.organization_id),
      productId: ProductIdSchema.parse(row.product_id), productName: row.display_name,
      instanceKey: row.instance_key, mode: row.mode, desiredEnabled: row.desired_enabled,
      provisioningStatus: row.provisioning_status,
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
