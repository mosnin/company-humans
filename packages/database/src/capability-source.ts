import type { Client } from 'pg';
import { z } from 'zod';
import { ProductCatalogMetadataV1Schema,EntitlementRevisionV1Schema,resolveRequestedCapabilities } from '@company-human/contracts';
interface ConfigurationRow {product_instance_id:string;membership_id:string;desired_revision:number;external_member_id:string;
 external_organization_id:string;catalog_metadata:unknown;revisions:unknown;}
/** Internal scoped reader. Caller must set and validate its service/worker context. */
export async function readCurrentCapabilityInputs(client:Client,organizationId:string,productMembershipId:string){
  // One statement snapshot captures member eligibility, catalog and all latest policy rows consistently.
  const result=await client.query<ConfigurationRow>(`SELECT pm.product_instance_id,pm.membership_id,pm.desired_revision,pm.external_member_id,
   i.external_organization_id,p.catalog_metadata,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('schemaVersion',1,'entitlementId',e.id,'organizationId',e.organization_id,
    'productInstanceId',e.product_instance_id,'membershipId',e.membership_id,'capability',e.capability,'revision',r.revision,'effect',r.effect) ORDER BY e.id)
    FROM public.entitlement_policies e JOIN LATERAL (SELECT revision,effect FROM public.entitlement_policy_revisions
      WHERE organization_id=e.organization_id AND entitlement_id=e.id ORDER BY revision DESC LIMIT 1) r ON true
    WHERE e.organization_id=pm.organization_id AND e.product_instance_id=pm.product_instance_id
      AND (e.membership_id IS NULL OR e.membership_id=pm.membership_id)),'[]'::jsonb) revisions
   FROM public.product_memberships pm
   JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
   JOIN public.products p ON p.id=i.product_id
   JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
   JOIN public.users u ON u.id=m.user_id JOIN public.organizations o ON o.id=pm.organization_id
   WHERE pm.organization_id=$1 AND pm.id=$2 AND pm.desired_enabled AND pm.provisioning_status='suspended'
    AND pm.external_member_id IS NOT NULL AND i.external_organization_id IS NOT NULL
    AND i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status<>'retired'
    AND m.status='active' AND u.status='active' AND o.status='active'
    AND EXISTS(SELECT 1 FROM public.role_permissions permission WHERE permission.organization_id=m.organization_id
      AND permission.role_id=m.role_id AND permission.permission_key='product.use')`,[organizationId,productMembershipId]);
  const row=result.rows[0];if(!row)return null;
  const catalog=ProductCatalogMetadataV1Schema.safeParse(row.catalog_metadata);if(!catalog.success)return null;
  const revisions=z.array(EntitlementRevisionV1Schema).parse(row.revisions);
  const scope={organizationId:organizationId,productInstanceId:row.product_instance_id,membershipId:row.membership_id};
  const capabilities=resolveRequestedCapabilities({...scope,supportedCapabilities:catalog.data.supportedCapabilities,revisions});
  const target={externalOrganizationId:row.external_organization_id,externalMemberId:row.external_member_id};
  const source={schemaVersion:1,desiredRevision:row.desired_revision,supportedCapabilities:[...catalog.data.supportedCapabilities].sort(),revisions,target};
  return {source,state:{...scope,schemaVersion:1 as const,capabilities,target,mode:'replace_all' as const,memberAccess:'suspended' as const}};
}
