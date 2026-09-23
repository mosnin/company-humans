import { Client } from 'pg';
import { z } from 'zod';
import { createCanonicalId, OrganizationIdSchema, ProductInstanceIdSchema, UserIdSchema, MembershipIdSchema, ProvisioningOperationIdSchema, ProductCatalogMetadataV1Schema } from '@company-human/contracts';
import { setServiceContext } from './service-context.js';
import { appendIdentityAudit } from './identity-audit.js';
const Request=z.object({actorUserId:UserIdSchema,organizationId:OrganizationIdSchema,productInstanceId:ProductInstanceIdSchema,externalOrganizationId:z.string().min(1).max(256)}).strict();
/** Candidate identity only. The adapter must verify authority using this tenant's authorized connection before success. */
export async function requestProductConnection(url:string,input:z.input<typeof Request>) {
  const parsed=Request.parse(input),client=new Client({connectionString:url});await client.connect();
  try {
    await client.query('BEGIN');await setServiceContext(client,parsed.actorUserId,parsed.organizationId);
    const actor=await client.query<{id:string}>("SELECT id FROM public.memberships WHERE organization_id=$1 AND user_id=$2 AND company_human_private.has_capability($1,'applications.manage')",[parsed.organizationId,parsed.actorUserId]);
    if(actor.rowCount!==1)throw new Error('Application administration denied');
    const instance=await client.query<{mode:string;desired_enabled:boolean;provisioning_status:string;catalog_status:string;catalog_metadata:unknown}>(`SELECT i.mode,i.desired_enabled,i.provisioning_status,p.catalog_status,p.catalog_metadata
      FROM public.product_instances i JOIN public.products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.id=$2 FOR UPDATE OF i`,[parsed.organizationId,parsed.productInstanceId]);
    const row=instance.rows[0],catalog=ProductCatalogMetadataV1Schema.safeParse(row?.catalog_metadata);
    if(!row||row.mode!=='connected'||!row.desired_enabled||row.provisioning_status!=='pending'||row.catalog_status==='retired'||!catalog.success||!catalog.data.provisioningModes.includes('connected'))throw new Error('Product connection unavailable');
    const existing=await client.query<{id:string;requested_external_organization_id:string}>("SELECT id,requested_external_organization_id FROM public.provisioning_operations WHERE organization_id=$1 AND product_instance_id=$2 AND operation='connectOrganization'",[parsed.organizationId,parsed.productInstanceId]);
    let operationId=existing.rows[0]?.id;
    if(operationId){if(existing.rows[0]!.requested_external_organization_id!==parsed.externalOrganizationId)throw new Error('Connection target cannot change during setup');}
    else {
      operationId=createCanonicalId('provisioningOperation');
      await client.query(`INSERT INTO public.provisioning_operations(id,organization_id,product_instance_id,operation,idempotency_key,requested_external_organization_id)
        VALUES($1,$2,$3,'connectOrganization',$4,$5)`,[operationId,parsed.organizationId,parsed.productInstanceId,`${parsed.productInstanceId}:connect:v1`,parsed.externalOrganizationId]);
      await appendIdentityAudit(client,{organizationId:parsed.organizationId,actorUserId:parsed.actorUserId,actorMembershipId:MembershipIdSchema.parse(actor.rows[0]!.id),
        action:'product.connection.requested',targetType:'product_instance',targetId:parsed.productInstanceId,afterState:{operationId,status:'pending'}});
    }
    await client.query('COMMIT');return ProvisioningOperationIdSchema.parse(operationId);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
