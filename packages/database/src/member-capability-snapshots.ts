import { Client } from 'pg';
import { z } from 'zod';
import { UserIdSchema,OrganizationIdSchema,ProductMembershipIdSchema,
  StagedCapabilitiesStateSchema,type StagedCapabilitiesState } from '@company-human/contracts';
import { setServiceContext } from './service-context.js';
import { readCurrentCapabilityInputs } from './capability-source.js';
import { appendIdentityAudit } from './identity-audit.js';
const Input=z.object({actorUserId:UserIdSchema,organizationId:OrganizationIdSchema,productMembershipId:ProductMembershipIdSchema}).strict();
/** Capture desired capabilities for staging. Not an access grant; workers must revalidate before use. */
export async function prepareMemberCapabilitySnapshot(url:string,input:z.input<typeof Input>):Promise<StagedCapabilitiesState>{
 const parsed=Input.parse(input),client=new Client({connectionString:url});await client.connect();
 try{
  await client.query('BEGIN');await setServiceContext(client,parsed.actorUserId,parsed.organizationId);
  if(!(await client.query("SELECT company_human_private.has_capability($1,'applications.manage') allowed",[parsed.organizationId])).rows[0]?.allowed)throw new Error('Application administration denied');
  // Serialize issuance before reading inputs, so concurrent refreshes cannot issue older state after newer state.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`capability-snapshot:${parsed.productMembershipId}`]);
  const current=await readCurrentCapabilityInputs(client,parsed.organizationId,parsed.productMembershipId);
  if(!current)throw new Error('Suspended product membership unavailable');
  const {source}=current;
  const previous=await client.query<{policy_revision:number;payload:unknown;same_source:boolean}>(`SELECT policy_revision,payload,source=$3::jsonb AS same_source
    FROM public.member_capability_snapshots WHERE organization_id=$1 AND product_membership_id=$2 ORDER BY policy_revision DESC LIMIT 1`,[parsed.organizationId,parsed.productMembershipId,source]);
  const latest=previous.rows[0];
  if(latest?.same_source){const state=StagedCapabilitiesStateSchema.parse(latest.payload);await client.query('COMMIT');return state;}
  const state=StagedCapabilitiesStateSchema.parse({...current.state,policyRevision:(latest?.policy_revision??0)+1});
  await client.query(`INSERT INTO public.member_capability_snapshots(organization_id,product_membership_id,policy_revision,source,payload,actor_user_id)
   VALUES($1,$2,$3,$4,$5,$6)`,[parsed.organizationId,parsed.productMembershipId,state.policyRevision,source,state,parsed.actorUserId]);
  await appendIdentityAudit(client,{organizationId:parsed.organizationId,actorUserId:parsed.actorUserId,action:'product.capabilities.prepared',
   targetType:'product_membership',targetId:parsed.productMembershipId,afterState:{policyRevision:state.policyRevision,capabilities:state.capabilities,providerAccessConfirmed:false}});
  await client.query('COMMIT');return state;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
