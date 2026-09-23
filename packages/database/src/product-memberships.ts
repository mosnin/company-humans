import { createCanonicalId, MembershipIdSchema, OrganizationIdSchema, ProductCatalogMetadataV1Schema, ProductInstanceIdSchema, ProductMembershipIdSchema, UserIdSchema, type ProductMembershipId } from "@company-human/contracts";
import { Client } from "pg";
import { setServiceContext } from "./service-context.js";
import { appendIdentityAudit } from "./identity-audit.js";

/** Record an organization-sponsored member intent; this does not grant product access. */
export async function requestProductMembership(databaseUrl: string, input: {
  actorUserId: string; organizationId: string; productInstanceId: string; membershipId: string;
}): Promise<ProductMembershipId> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const actorUserId = UserIdSchema.parse(input.actorUserId);
  const organizationId = OrganizationIdSchema.parse(input.organizationId);
  const instanceId = ProductInstanceIdSchema.parse(input.productInstanceId);
  const membershipId = MembershipIdSchema.parse(input.membershipId);
  const client = new Client({ connectionString: databaseUrl }); await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client,actorUserId,organizationId);
    const actor = await client.query<{ id: string }>(`SELECT id FROM public.memberships WHERE organization_id=$1 AND user_id=$2
      AND company_human_private.has_capability($1,'applications.manage')`,[organizationId,actorUserId]);
    if (actor.rowCount !== 1) throw new Error("Application administration denied");
    const product = await client.query<{product_id:string}>(`SELECT product_id FROM public.product_instances
      WHERE organization_id=$1 AND id=$2`,[organizationId,instanceId]);
    if (!product.rows[0]) throw new Error("Product or membership unavailable");
    // Catalog and role-policy edits use these locks. Recheck after acquiring
    // them so an admin cannot request an inert member intent from stale truth.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`product-catalog-access:${product.rows[0].product_id}`]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`product-authorization:${organizationId}`]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`organization-access:${organizationId}`]);
    await client.query("SELECT company_human_private.lock_member_request_context($1,$2,$3)",
      [organizationId,actor.rows[0]!.id,membershipId]);
    // The first capability read may predate a lock wait. Re-read it before
    // creating intent; the restrictive insert policy repeats this at SQL level.
    const currentActor = await client.query(`SELECT id FROM public.memberships WHERE organization_id=$1 AND id=$2
      AND company_human_private.has_capability($1,'applications.manage')`,[organizationId,actor.rows[0]!.id]);
    if (currentActor.rowCount !== 1) throw new Error("Application administration denied");
    const currentCatalog = await client.query<{mode:string;catalog_metadata:unknown}>(`SELECT i.mode,p.catalog_metadata
      FROM public.product_instances i JOIN public.products p ON p.id=i.product_id
      WHERE i.organization_id=$1 AND i.id=$2`,[organizationId,instanceId]);
    const metadata=ProductCatalogMetadataV1Schema.safeParse(currentCatalog.rows[0]?.catalog_metadata);
    if (!metadata.success || !metadata.data.provisioningModes.some(mode=>mode===currentCatalog.rows[0]?.mode)
      || !metadata.data.supportedMemberOperations.includes('provision'))
      throw new Error("Product or membership unavailable");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify([organizationId,instanceId,membershipId])]);
    const existing = await client.query<{id:string;desired_enabled:boolean;policy_blocked:boolean}>(`SELECT id,desired_enabled,policy_blocked FROM public.product_memberships
      WHERE organization_id=$1 AND product_instance_id=$2 AND membership_id=$3`,[organizationId,instanceId,membershipId]);
    if (existing.rows[0] && (!existing.rows[0].desired_enabled || existing.rows[0].policy_blocked))
      throw new Error("Product membership requires reconciliation before re-enabling");
    const target = await client.query<{eligible:boolean}>(`SELECT company_human_private.member_request_eligible($1,$2,$3) AS eligible`,
      [organizationId,instanceId,membershipId]);
    if (!target.rows[0]?.eligible) throw new Error("Product or membership unavailable");
    if (existing.rows[0]) {
      await client.query("COMMIT"); return ProductMembershipIdSchema.parse(existing.rows[0].id);
    }
    const id=createCanonicalId("productMembership");
    await client.query(`INSERT INTO public.product_memberships (id,organization_id,product_instance_id,membership_id,created_by_user_id)
      VALUES ($1,$2,$3,$4,$5)`,[id,organizationId,instanceId,membershipId,actorUserId]);
    await client.query(`INSERT INTO public.product_membership_commands
      (id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id)
      VALUES ($1,$2,$3,1,'provisionMember',$4,$5)`,[createCanonicalId("provisioningOperation"),organizationId,id,`${id}:member:1`,actorUserId]);
    await appendIdentityAudit(client,{organizationId,actorUserId,actorMembershipId:MembershipIdSchema.parse(actor.rows[0]!.id),
      action:"product.membership.requested",targetType:"product_membership",targetId:id,
      afterState:{membershipId,productInstanceId:instanceId,desiredEnabled:true,provisioningStatus:"pending"}});
    await client.query("COMMIT"); return id;
  } catch(error) {await client.query("ROLLBACK");throw error;} finally {await client.end();}
}
