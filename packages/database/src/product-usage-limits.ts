import { Client } from "pg";
import { z } from "zod";
import { createCanonicalId, LimitQuantitySchema, LimitWindowSchema, UsageLimitRevisionV1Schema, OrganizationIdSchema,
  ProductInstanceIdSchema, MembershipIdSchema, UserIdSchema, ProductCapabilityKeySchema, ProductCatalogMetadataV1Schema } from "@company-human/contracts";
import { setServiceContext } from "./service-context.js";
import { appendIdentityAudit } from "./identity-audit.js";
const Change = z.object({
  actorUserId: UserIdSchema, organizationId: OrganizationIdSchema, productInstanceId: ProductInstanceIdSchema,
  membershipId: MembershipIdSchema.nullable(), meterKey: ProductCapabilityKeySchema, unit: ProductCapabilityKeySchema,
  window: LimitWindowSchema, maximumQuantity: LimitQuantitySchema, expectedRevision: z.number().int().nonnegative().max(2147483646),
}).strict();
export class UsageLimitConflict extends Error { constructor() { super("Usage limit changed. Reload before saving."); } }
/** Desired finite configuration only. This neither allocates capacity nor authorizes product work. */
export async function setProductUsageLimit(url: string, input: z.input<typeof Change>) {
  const parsed = Change.parse(input), client = new Client({ connectionString: url }); await client.connect();
  try {
    await client.query("BEGIN"); await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    const actor = await client.query<{ id: string }>(`SELECT id FROM public.memberships WHERE organization_id=$1 AND user_id=$2
      AND company_human_private.has_capability($1,'budgets.manage')`, [parsed.organizationId, parsed.actorUserId]);
    if (actor.rowCount !== 1) throw new Error("Budget administration denied");
    const instance = await client.query<{ catalog_status: string; catalog_metadata: unknown }>(`SELECT p.catalog_status,p.catalog_metadata FROM public.product_instances i
      JOIN public.products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.id=$2`, [parsed.organizationId, parsed.productInstanceId]);
    if (!instance.rows[0]) throw new Error("Product instance unavailable");
    if (parsed.membershipId !== null) {
      const member = await client.query("SELECT id FROM public.memberships WHERE organization_id=$1 AND id=$2", [parsed.organizationId, parsed.membershipId]);
      if (member.rowCount !== 1) throw new Error("Membership unavailable");
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["usage-limit", parsed.organizationId, parsed.productInstanceId, parsed.membershipId, parsed.meterKey, parsed.window])]);
    const existing = await client.query<{ id: string; unit: string; revision: number; maximum_quantity: string }>(`SELECT l.id,l.unit,COALESCE(r.revision,0) AS revision,r.maximum_quantity FROM public.product_usage_limits l
      LEFT JOIN LATERAL (SELECT revision,maximum_quantity FROM public.product_usage_limit_revisions WHERE organization_id=l.organization_id AND usage_limit_id=l.id ORDER BY revision DESC LIMIT 1) r ON true
      WHERE l.organization_id=$1 AND l.product_instance_id=$2 AND l.membership_id IS NOT DISTINCT FROM $3 AND l.meter_key=$4 AND l.window_key=$5`,
    [parsed.organizationId, parsed.productInstanceId, parsed.membershipId, parsed.meterKey, parsed.window]);
    const previous = existing.rows[0];
    if ((previous?.revision ?? 0) !== parsed.expectedRevision) throw new UsageLimitConflict();
    if (previous && previous.unit !== parsed.unit) throw new Error("Usage limit unit is immutable");
    // A known historical meter may still be stopped if its catalog entry disappears.
    if (!previous || parsed.maximumQuantity !== "0") {
      const catalog = ProductCatalogMetadataV1Schema.safeParse(instance.rows[0].catalog_metadata);
      if (instance.rows[0].catalog_status === "retired" || !catalog.success || !catalog.data.usageMeters.includes(parsed.meterKey)) throw new Error("Meter unavailable");
    }
    const id = previous?.id ?? createCanonicalId("usageLimit"), revision = parsed.expectedRevision + 1;
    if (!previous) await client.query(`INSERT INTO public.product_usage_limits
      (id,organization_id,product_instance_id,membership_id,meter_key,unit,window_key,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, parsed.organizationId, parsed.productInstanceId, parsed.membershipId, parsed.meterKey, parsed.unit, parsed.window, parsed.actorUserId]);
    await client.query(`INSERT INTO public.product_usage_limit_revisions (organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id)
      VALUES ($1,$2,$3,$4,$5)`, [parsed.organizationId, id, revision, parsed.maximumQuantity, parsed.actorUserId]);
    await appendIdentityAudit(client, { organizationId: parsed.organizationId, actorUserId: parsed.actorUserId, actorMembershipId: MembershipIdSchema.parse(actor.rows[0]!.id),
      action: "product.usage_limit.configured", targetType: "usage_limit", targetId: id,
      beforeState: previous ? { revision: previous.revision, maximumQuantity: previous.maximum_quantity } : undefined,
      afterState: { revision, maximumQuantity: parsed.maximumQuantity, productInstanceId: parsed.productInstanceId, membershipId: parsed.membershipId, meterKey: parsed.meterKey, unit: parsed.unit, window: parsed.window } });
    const result = UsageLimitRevisionV1Schema.parse({ schemaVersion: 1, usageLimitId: id, organizationId: parsed.organizationId,
      productInstanceId: parsed.productInstanceId, membershipId: parsed.membershipId, meterKey: parsed.meterKey, unit: parsed.unit,
      window: parsed.window, revision, maximumQuantity: parsed.maximumQuantity });
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { await client.end(); }
}
