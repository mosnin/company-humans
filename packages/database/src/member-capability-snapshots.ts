import { Client } from 'pg';
import { z } from 'zod';
import { UserIdSchema,OrganizationIdSchema,ProductMembershipIdSchema,ProductCatalogMetadataV1Schema,
  StagedCapabilitiesStateSchema,EntitlementRevisionV1Schema,resolveRequestedCapabilities,type StagedCapabilitiesState } from '@company-human/contracts';
import { setServiceContext } from './service-context.js';
import { appendIdentityAudit } from './identity-audit.js';
const Input=z.object({actorUserId:UserIdSchema,organizationId:OrganizationIdSchema,productMembershipId:ProductMembershipIdSchema}).strict();
interface ConfigurationRow {product_instance_id:string;membership_id:string;desired_revision:number;external_member_id:string;
 external_organization_id:string;catalog_metadata:unknown;revisions:unknown;}
/** Capture desired capabilities for staging. Not an access grant; workers must revalidate before use. */
export async function prepareMemberCapabilitySnapshot(url:string,input:z.input<typeof Input>):Promise<StagedCapabilitiesState>{
 const parsed=Input.parse(input),client=new Client({connectionString:url});await client.connect();
 try{
  await client.query('BEGIN');await setServiceContext(client,parsed.actorUserId,parsed.organizationId);
  if(!(await client.query("SELECT company_human_private.has_capability($1,'applications.manage') allowed",[parsed.organizationId])).rows[0]?.allowed)throw new Error('Application administration denied');
  // Serialize issuance before reading inputs, so concurrent refreshes cannot issue older state after newer state.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`capability-snapshot:${parsed.productMembershipId}`]);
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
    AND m.status='active' AND u.status='active' AND o.status='active'`,[parsed.organizationId,parsed.productMembershipId]);
  const row=result.rows[0];if(!row)throw new Error('Suspended product membership unavailable');
  const catalog=ProductCatalogMetadataV1Schema.safeParse(row.catalog_metadata);if(!catalog.success)throw new Error('Capability catalog unavailable');
  const revisions=z.array(EntitlementRevisionV1Schema).parse(row.revisions);
  const scope={organizationId:parsed.organizationId,productInstanceId:row.product_instance_id,membershipId:row.membership_id};
  const capabilities=resolveRequestedCapabilities({...scope,supportedCapabilities:catalog.data.supportedCapabilities,revisions});
  const target={externalOrganizationId:row.external_organization_id,externalMemberId:row.external_member_id};
  const source={schemaVersion:1,desiredRevision:row.desired_revision,supportedCapabilities:[...catalog.data.supportedCapabilities].sort(),revisions,target};
  const previous=await client.query<{policy_revision:number;payload:unknown;same_source:boolean}>(`SELECT policy_revision,payload,source=$3::jsonb AS same_source
    FROM public.member_capability_snapshots WHERE organization_id=$1 AND product_membership_id=$2 ORDER BY policy_revision DESC LIMIT 1`,[parsed.organizationId,parsed.productMembershipId,source]);
  const latest=previous.rows[0];
  if(latest?.same_source){const state=StagedCapabilitiesStateSchema.parse(latest.payload);await client.query('COMMIT');return state;}
  const state=StagedCapabilitiesStateSchema.parse({...scope,schemaVersion:1,policyRevision:(latest?.policy_revision??0)+1,capabilities,target,mode:'replace_all',memberAccess:'suspended'});
  await client.query(`INSERT INTO public.member_capability_snapshots(organization_id,product_membership_id,policy_revision,source,payload,actor_user_id)
   VALUES($1,$2,$3,$4,$5,$6)`,[parsed.organizationId,parsed.productMembershipId,state.policyRevision,source,state,parsed.actorUserId]);
  await appendIdentityAudit(client,{organizationId:parsed.organizationId,actorUserId:parsed.actorUserId,action:'product.capabilities.prepared',
   targetType:'product_membership',targetId:parsed.productMembershipId,afterState:{policyRevision:state.policyRevision,capabilities,providerAccessConfirmed:false}});
  await client.query('COMMIT');return state;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
