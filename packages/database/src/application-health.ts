import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { AdapterHealthSchema, assessAdapterHealth, assertProductAdapterV1, assertProductAdapterV2,
  OrganizationIdSchema, ProductInstanceIdSchema, ProductIdSchema,
  type ProductAdapterV1, type ProductAdapterV2 } from '@company-human/contracts';
import { appendServiceAudit } from './identity-audit.js';

/** Monitoring policy, not authorization freshness. Failed/latest checks must not fall back to old healthy. */
export const APPLICATION_HEALTH_MAX_AGE_MS=300000;
type Failure='adapter_transport_failure'|'invalid_adapter_response'|'future_observation'|'check_pending'|'authentication_required'|'rate_limited'|'provider_unavailable';
async function transaction<T>(url:string,org:string,product:string,run:(client:Client)=>Promise<T>):Promise<T>{
  const client=new Client({connectionString:url});await client.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query<{allowed:boolean}>(`SELECT pg_has_role(current_user,'company_human_health_worker','member') AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND NOT pg_has_role(current_user,'company_human_service','member')
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.application_health_observations'::regclass),'member') AS allowed FROM pg_roles r WHERE rolname=current_user`);
    if(!result.rows[0]?.allowed)throw new Error('Health collection requires a restricted worker role');
    await client.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.product_id',$2,true)",[org,product]);
    const value=await run(client);await client.query('COMMIT');return value;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
async function binding(client:Client,org:string,instance:string){
  return (await client.query<{external_organization_id:string;started_at:Date}>(`SELECT i.external_organization_id,clock_timestamp() AS started_at FROM public.product_instances i
    JOIN public.organizations o ON o.id=i.organization_id JOIN public.products p ON p.id=i.product_id
    WHERE i.organization_id=$1 AND i.id=$2 AND i.external_organization_id IS NOT NULL AND o.status='active' AND p.catalog_status<>'retired'`,[org,instance])).rows[0] ?? null;
}
/** Trusted scheduler supplies the tenant-bound adapter registration; no browser URL or credentials accepted. */
export async function collectApplicationHealth(url:string,input:{organizationId:string;productInstanceId:string},registration:{productId:string;adapter:ProductAdapterV1|ProductAdapterV2}):Promise<'unavailable'|'superseded'|'recorded'>{
  const org=OrganizationIdSchema.parse(input.organizationId),instance=ProductInstanceIdSchema.parse(input.productInstanceId),product=ProductIdSchema.parse(registration.productId);
  if(registration.adapter.contractVersion===2)assertProductAdapterV2(registration.adapter);else assertProductAdapterV1(registration.adapter);
  const before=await transaction(url,org,product,client=>binding(client,org,instance));if(!before)return 'unavailable';
  let health:unknown=null,failure:Failure|null='adapter_transport_failure',timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const raw:unknown=await Promise.race([registration.adapter.getHealth({organizationId:org,productInstanceId:instance}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Health deadline exceeded')),10000);})]);
    if(raw && typeof raw==='object' && 'status' in raw){
      const result=raw as Record<string,unknown>;
      if(result.status==='succeeded'){
        const parsed=AdapterHealthSchema.safeParse(result.value);
        if(!parsed.success)failure='invalid_adapter_response';
        else if(assessAdapterHealth(parsed.data,new Date(),APPLICATION_HEALTH_MAX_AGE_MS).state==='unknown')failure='future_observation';
        else {const {providerStatus:_privateText,...safe}=parsed.data;health=safe;failure=null;}
      }else if(result.status==='pending')failure='check_pending';
      else if(result.status==='retryable_failure'||result.status==='permanent_failure')failure=result.code==='authentication_required'?'authentication_required':result.code==='rate_limited'?'rate_limited':'provider_unavailable';
      else failure='invalid_adapter_response';
    }else failure='invalid_adapter_response';
  }catch{/* No exception text or free-form provider status enters the observation. */}finally{if(timer)clearTimeout(timer);}
  return transaction(url,org,product,async client=>{
    const after=await binding(client,org,instance);if(!after||after.external_organization_id!==before.external_organization_id)return 'superseded';
    const observationId=randomUUID();
    await client.query('INSERT INTO public.application_health_observations(id,organization_id,product_instance_id,external_organization_id,started_at,health,failure_code) VALUES($1,$2,$3,$4,$5,$6,$7)',[observationId,org,instance,before.external_organization_id,before.started_at,health===null?null:JSON.stringify(health),failure]);
    await appendServiceAudit(client,{organizationId:org,serviceId:'health-worker',action:'product.health.observed',targetType:'product_instance',targetId:instance,afterState:{observationId,failureCode:failure}});
    return 'recorded';
  });
}
