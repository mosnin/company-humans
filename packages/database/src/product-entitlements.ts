import { Client } from "pg";
import { z } from "zod";
import { createCanonicalId,EntitlementEffectSchema,EntitlementRevisionV1Schema,OrganizationIdSchema,ProductInstanceIdSchema,
  ProductCapabilityKeySchema,MembershipIdSchema,UserIdSchema,ProductCatalogMetadataV1Schema } from "@company-human/contracts";
import { setServiceContext } from "./service-context.js";
import { appendIdentityAudit } from "./identity-audit.js";
const Change=z.object({actorUserId:UserIdSchema,organizationId:OrganizationIdSchema,productInstanceId:ProductInstanceIdSchema,
  membershipId:MembershipIdSchema.nullable(),capability:ProductCapabilityKeySchema,effect:EntitlementEffectSchema,
  expectedRevision:z.number().int().nonnegative().max(2147483646)}).strict();
export class EntitlementConflict extends Error {constructor(){super('Entitlement changed. Reload before saving.');}}
/** Versioned desired configuration only. Never use this result alone to authorize product work. */
export async function setProductEntitlement(url:string,input:z.input<typeof Change>) {
  const parsed=Change.parse(input),client=new Client({connectionString:url});await client.connect();
  try {
    await client.query('BEGIN');await setServiceContext(client,parsed.actorUserId,parsed.organizationId);
    const actor=await client.query<{id:string}>(`SELECT id FROM public.memberships WHERE organization_id=$1 AND user_id=$2
      AND company_human_private.has_capability($1,'applications.manage')`,[parsed.organizationId,parsed.actorUserId]);
    if(actor.rowCount!==1)throw new Error('Application administration denied');
    const instance=await client.query<{catalog_status:string;catalog_metadata:unknown}>(`SELECT p.catalog_status,p.catalog_metadata FROM public.product_instances i
      JOIN public.products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.id=$2`,[parsed.organizationId,parsed.productInstanceId]);
    if(!instance.rows[0])throw new Error('Product instance unavailable');
    if(parsed.membershipId!==null) {
      const member=await client.query('SELECT id FROM public.memberships WHERE organization_id=$1 AND id=$2',[parsed.organizationId,parsed.membershipId]);
      if(member.rowCount!==1)throw new Error('Membership unavailable');
    }
    if(parsed.effect==='allow') {
      const catalog=ProductCatalogMetadataV1Schema.safeParse(instance.rows[0].catalog_metadata);
      if(instance.rows[0].catalog_status==='retired'||!catalog.success||!catalog.data.supportedCapabilities.includes(parsed.capability))throw new Error('Capability unavailable');
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['entitlement',parsed.organizationId,parsed.productInstanceId,parsed.membershipId,parsed.capability])]);
    const existing=await client.query<{id:string;revision:number;effect:string}>(`SELECT e.id,COALESCE(r.revision,0) AS revision,r.effect FROM public.entitlement_policies e
      LEFT JOIN LATERAL (SELECT revision,effect FROM public.entitlement_policy_revisions WHERE organization_id=e.organization_id AND entitlement_id=e.id ORDER BY revision DESC LIMIT 1) r ON true
      WHERE e.organization_id=$1 AND e.product_instance_id=$2 AND e.membership_id IS NOT DISTINCT FROM $3 AND e.capability=$4`,[parsed.organizationId,parsed.productInstanceId,parsed.membershipId,parsed.capability]);
    const previous=existing.rows[0];
    if((previous?.revision??0)!==parsed.expectedRevision)throw new EntitlementConflict();
    const id=previous?.id??createCanonicalId('entitlement');
    if(!previous)await client.query(`INSERT INTO public.entitlement_policies (id,organization_id,product_instance_id,membership_id,capability,created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6)`,[id,parsed.organizationId,parsed.productInstanceId,parsed.membershipId,parsed.capability,parsed.actorUserId]);
    const revision=parsed.expectedRevision+1;
    await client.query(`INSERT INTO public.entitlement_policy_revisions (organization_id,entitlement_id,revision,effect,actor_user_id)
      VALUES ($1,$2,$3,$4,$5)`,[parsed.organizationId,id,revision,parsed.effect,parsed.actorUserId]);
    await appendIdentityAudit(client,{organizationId:parsed.organizationId,actorUserId:parsed.actorUserId,actorMembershipId:MembershipIdSchema.parse(actor.rows[0]!.id),
      action:'product.entitlement.configured',targetType:'entitlement',targetId:id,
      beforeState:previous?{revision:previous.revision,effect:previous.effect}:undefined,
      afterState:{revision,effect:parsed.effect,productInstanceId:parsed.productInstanceId,membershipId:parsed.membershipId,capability:parsed.capability}});
    const result=EntitlementRevisionV1Schema.parse({schemaVersion:1,entitlementId:id,organizationId:parsed.organizationId,productInstanceId:parsed.productInstanceId,
      membershipId:parsed.membershipId,capability:parsed.capability,revision,effect:parsed.effect});
    await client.query('COMMIT');return result;
  } catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
