import { Client } from 'pg';
import { z } from 'zod';
import { OrganizationIdSchema,ProductIdSchema,ProductMembershipIdSchema,StagedCapabilitiesStateSchema } from '@company-human/contracts';
import { readCurrentCapabilityInputs } from './capability-source.js';
import { appendServiceAudit } from './identity-audit.js';
const Input=z.object({organizationId:OrganizationIdSchema,productId:ProductIdSchema,after:ProductMembershipIdSchema.nullable().default(null),limit:z.number().int().min(1).max(50).default(25)}).strict();
/** One bounded scan page for a trusted scheduler. Repeat from null after finishing each scan. */
export async function refreshCapabilitySnapshots(url:string,input:z.input<typeof Input>){
 const scope=Input.parse(input),client=new Client({connectionString:url});await client.connect();
 const context=()=>client.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.product_id',$2,true)",[scope.organizationId,scope.productId]);
 try{
  await client.query('BEGIN');
  const role=await client.query(`SELECT pg_has_role(current_user,'company_human_capability_preparer','member') AND NOT r.rolsuper AND NOT r.rolbypassrls
   AND NOT pg_has_role(current_user,'company_human_service','member')
   AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.member_capability_snapshots'::regclass),'member') AS allowed FROM pg_roles r WHERE rolname=current_user`);
  if(!role.rows[0]?.allowed)throw new Error('Capability refresh requires a restricted preparer role');
  await context();
  const candidates=await client.query<{id:string}>(`SELECT pm.id FROM public.product_memberships pm
   JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
   WHERE pm.organization_id=$1 AND i.product_id=$2 AND ($3::text IS NULL OR pm.id>$3)
    AND pm.provisioning_status='suspended' AND pm.external_member_id IS NOT NULL
   ORDER BY pm.id LIMIT $4`,[scope.organizationId,scope.productId,scope.after,scope.limit+1]);
  await client.query('COMMIT');
  let prepared=0,reused=0,skipped=0;
  const page=candidates.rows.slice(0,scope.limit);
  for(const {id} of page){
   await client.query('BEGIN');await context();
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`capability-snapshot:${id}`]);
   const current=await readCurrentCapabilityInputs(client,scope.organizationId,id);
   if(!current){skipped++;await client.query('COMMIT');continue;}
   const previous=await client.query<{policy_revision:number;same_source:boolean;payload:unknown}>(`SELECT policy_revision,source=$3::jsonb same_source,payload
    FROM public.member_capability_snapshots WHERE organization_id=$1 AND product_membership_id=$2 ORDER BY policy_revision DESC LIMIT 1`,[scope.organizationId,id,current.source]);
   const latest=previous.rows[0];
   if(latest?.same_source){
    // Existing snapshots are configuration, not authority. The staging worker independently revalidates their payload.
    StagedCapabilitiesStateSchema.parse(latest.payload);reused++;await client.query('COMMIT');continue;
   }
   const state=StagedCapabilitiesStateSchema.parse({...current.state,policyRevision:(latest?.policy_revision??0)+1});
   await client.query(`INSERT INTO public.member_capability_snapshots(organization_id,product_membership_id,policy_revision,source,payload,actor_service_id)
    VALUES($1,$2,$3,$4,$5,'capability-preparer')`,[scope.organizationId,id,state.policyRevision,current.source,state]);
   await appendServiceAudit(client,{organizationId:scope.organizationId,serviceId:'capability-preparer',action:'product.capabilities.refreshed',targetType:'product_membership',targetId:id,
    afterState:{policyRevision:state.policyRevision,capabilities:state.capabilities,providerAccessConfirmed:false}});
   await client.query('COMMIT');prepared++;
  }
  return {scanned:page.length,prepared,reused,skipped,nextCursor:candidates.rows.length>scope.limit?page.at(-1)!.id:null};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
