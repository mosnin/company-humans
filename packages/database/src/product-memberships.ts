import { createCanonicalId, MembershipIdSchema, OrganizationIdSchema, ProductInstanceIdSchema, ProductMembershipIdSchema, UserIdSchema, type ProductMembershipId } from "@company-human/contracts";
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
    const target = await client.query(`SELECT m.id FROM public.memberships m JOIN public.users u ON u.id=m.user_id
      JOIN public.product_instances i ON i.organization_id=m.organization_id AND i.id=$3
      JOIN public.products p ON p.id=i.product_id WHERE m.organization_id=$1 AND m.id=$2
      AND m.status='active' AND u.status='active' AND i.desired_enabled AND i.provisioning_status='active'
      AND p.catalog_status<>'retired'`,[organizationId,membershipId,instanceId]);
    if (target.rowCount !== 1) throw new Error("Product or membership unavailable");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify([organizationId,instanceId,membershipId])]);
    const existing = await client.query<{id:string;desired_enabled:boolean}>(`SELECT id,desired_enabled FROM public.product_memberships
      WHERE organization_id=$1 AND product_instance_id=$2 AND membership_id=$3`,[organizationId,instanceId,membershipId]);
    if (existing.rows[0]) {
      if (!existing.rows[0].desired_enabled) throw new Error("Product membership requires reconciliation before re-enabling");
      await client.query("COMMIT"); return ProductMembershipIdSchema.parse(existing.rows[0].id);
    }
    const id=createCanonicalId("productMembership");
    await client.query(`INSERT INTO public.product_memberships (id,organization_id,product_instance_id,membership_id,created_by_user_id)
      VALUES ($1,$2,$3,$4,$5)`,[id,organizationId,instanceId,membershipId,actorUserId]);
    await appendIdentityAudit(client,{organizationId,actorUserId,actorMembershipId:MembershipIdSchema.parse(actor.rows[0]!.id),
      action:"product.membership.requested",targetType:"product_membership",targetId:id,
      afterState:{membershipId,productInstanceId:instanceId,desiredEnabled:true,provisioningStatus:"pending"}});
    await client.query("COMMIT"); return id;
  } catch(error) {await client.query("ROLLBACK");throw error;} finally {await client.end();}
}
