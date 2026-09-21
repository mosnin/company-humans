import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";
import { OrganizationIdSchema, ProductIdSchema, ProductInstanceIdSchema, MembershipIdSchema, ProvisioningOperationIdSchema,
  assertProductAdapterV1, type OrganizationId, type ProductId, type ProductAdapterV1 } from "@company-human/contracts";
const Code=z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/);
const Response=z.discriminatedUnion("status",[
  z.object({status:z.literal("succeeded"),value:z.object({externalMemberId:z.string().min(1).max(512),status:z.enum(["active","suspended","removed"])}).strict()}).strict(),
  z.object({status:z.literal("pending"),operationId:z.string().min(1).max(512)}).strict(),
  z.object({status:z.literal("retryable_failure"),code:Code,retryAfterSeconds:z.number().int().min(1).max(86400).optional()}).strict(),
  z.object({status:z.literal("permanent_failure"),code:Code}).strict(),
]);
type Receipt=z.infer<typeof Response>;
interface Row {command_id:string;product_instance_id:string;membership_id:string;operation:"suspendMember"|"removeMember";
  idempotency_key:string;attempt_count:number;status:string;lease_token:string|null;expired:boolean;current_revision:boolean;external_member_id:string|null;}
export interface MemberDenialLease { commandId:string;productInstanceId:string;membershipId:string;operation:"suspendMember"|"removeMember";
  idempotencyKey:string;leaseToken:string;attemptNumber:number; }
async function transaction<T>(url:string,organizationId:OrganizationId,run:(client:Client)=>Promise<T>):Promise<T> {
  OrganizationIdSchema.parse(organizationId);
  const client=new Client({connectionString:url});await client.connect();
  try {
    await client.query("BEGIN");
    const role=await client.query<{allowed:boolean}>(`SELECT pg_has_role(current_user,'company_human_member_worker','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND NOT pg_has_role(current_user,'company_human_service','member')
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.member_denial_jobs'::regclass),'member') AS allowed
      FROM pg_roles r WHERE rolname=current_user`);
    if(!role.rows[0]?.allowed) throw new Error("Member denial requires a restricted worker role");
    await client.query("SELECT set_config('company_human.organization_id',$1,true)",[organizationId]);
    const value=await run(client);await client.query("COMMIT");return value;
  } catch(error) {await client.query("ROLLBACK");throw error;} finally {await client.end();}
}
/** Trusted server/job scope only. This is deliberately not a public endpoint. */
export async function claimMemberDenial(url:string,organizationId:OrganizationId,productId:ProductId):Promise<MemberDenialLease|null> {
  ProductIdSchema.parse(productId);
  return transaction(url,organizationId,async client=>{
    // Serialize claims per tenant/product, including first job insertion.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`member-denial:${organizationId}:${productId}`]);
    await client.query(`INSERT INTO public.member_denial_jobs (command_id,organization_id)
      SELECT c.id,c.organization_id FROM public.product_membership_commands c
      JOIN public.product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
      JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
      WHERE c.organization_id=$1 AND i.product_id=$2 AND c.operation IN ('suspendMember','removeMember')
        AND c.desired_revision=pm.desired_revision AND NOT pm.desired_enabled
      ON CONFLICT (command_id) DO NOTHING`,[organizationId,productId]);
    const result=await client.query<Row>(`SELECT j.*,c.operation,c.idempotency_key,pm.product_instance_id,pm.membership_id,
      j.lease_expires_at<=clock_timestamp() AS expired,(c.desired_revision=pm.desired_revision AND NOT pm.desired_enabled) AS current_revision
      FROM public.member_denial_jobs j JOIN public.product_membership_commands c ON c.id=j.command_id AND c.organization_id=j.organization_id
      JOIN public.product_memberships pm ON pm.id=c.product_membership_id AND pm.organization_id=c.organization_id
      JOIN public.product_instances i ON i.id=pm.product_instance_id AND i.organization_id=pm.organization_id
      WHERE j.organization_id=$1 AND i.product_id=$2
        AND ((j.status IN ('pending','retry_wait') AND j.next_attempt_at<=now()) OR (j.status='running' AND j.lease_expires_at<=now()))
        AND NOT EXISTS (SELECT 1 FROM public.member_denial_jobs other JOIN public.product_membership_commands oc
          ON oc.id=other.command_id AND oc.organization_id=other.organization_id
          WHERE oc.product_membership_id=pm.id AND other.command_id<>j.command_id AND other.status='running' AND other.lease_expires_at>now())
      ORDER BY c.desired_revision,j.command_id FOR UPDATE OF j SKIP LOCKED LIMIT 1`,[organizationId,productId]);
    const row=result.rows[0];if(!row)return null;
    if(row.status==='running') await client.query(`UPDATE public.member_denial_attempts SET finished_at=now(),outcome='lease_expired',failure_code='worker_lease_expired'
      WHERE command_id=$1 AND attempt_number=$2 AND finished_at IS NULL`,[row.command_id,row.attempt_count]);
    if(!row.current_revision || row.attempt_count>=5) {
      await client.query(`UPDATE public.member_denial_jobs SET status=$2,failure_code=$3,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE command_id=$1`,
        [row.command_id,row.current_revision?'failed':'superseded',row.current_revision?'retry_exhausted':'superseded_revision']);
      return null;
    }
    const leaseToken=randomUUID(),attemptNumber=row.attempt_count+1;
    await client.query(`UPDATE public.member_denial_jobs SET status='running',attempt_count=$2,lease_token=$3,lease_expires_at=now()+interval '2 minutes',updated_at=now() WHERE command_id=$1`,[row.command_id,attemptNumber,leaseToken]);
    await client.query(`INSERT INTO public.member_denial_attempts (organization_id,command_id,attempt_number,lease_token) VALUES ($1,$2,$3,$4)`,[organizationId,row.command_id,attemptNumber,leaseToken]);
    return {commandId:row.command_id,productInstanceId:row.product_instance_id,membershipId:row.membership_id,operation:row.operation,
      idempotencyKey:row.idempotency_key,leaseToken,attemptNumber};
  });
}
export async function finishMemberDenial(url:string,organizationId:OrganizationId,lease:MemberDenialLease,raw:Receipt):Promise<void> {
  ProvisioningOperationIdSchema.parse(lease.commandId);z.uuid().parse(lease.leaseToken);
  const receipt=Response.parse(raw);
  await transaction(url,organizationId,async client=>{
    const result=await client.query<Row>(`SELECT j.*,c.operation,pm.external_member_id,(c.desired_revision=pm.desired_revision AND NOT pm.desired_enabled) AS current_revision,
      j.lease_expires_at<=clock_timestamp() AS expired FROM public.member_denial_jobs j
      JOIN public.product_membership_commands c ON c.id=j.command_id AND c.organization_id=j.organization_id
      JOIN public.product_memberships pm ON pm.id=c.product_membership_id AND pm.organization_id=c.organization_id
      WHERE j.command_id=$1 AND j.organization_id=$2 FOR UPDATE OF j`,[lease.commandId,organizationId]);
    const row=result.rows[0];if(!row||row.status!=='running'||row.lease_token!==lease.leaseToken||row.expired)throw new Error("Stale member denial lease");
    const acceptable=receipt.status!=='succeeded'||(row.operation==='removeMember'?receipt.value.status==='removed':['suspended','removed'].includes(receipt.value.status));
    const wrongMember=receipt.status==='succeeded'&&row.external_member_id!==null&&row.external_member_id!==receipt.value.externalMemberId;
    const normalized:Receipt=wrongMember?{status:'permanent_failure',code:'provider_member_mismatch'}:acceptable?receipt:{status:'permanent_failure',code:'provider_access_not_denied'};
    const retry=normalized.status==='pending'||normalized.status==='retryable_failure';
    const status=!row.current_revision?'superseded':normalized.status==='succeeded'?'succeeded':retry&&row.attempt_count<5?'retry_wait':'failed';
    const code=!row.current_revision?'superseded_revision':retry&&row.attempt_count>=5?'retry_exhausted':'code' in normalized?normalized.code:null;
    const reference=normalized.status==='succeeded'?normalized.value.externalMemberId:normalized.status==='pending'?normalized.operationId:null;
    const delay=normalized.status==='retryable_failure'&&normalized.retryAfterSeconds?normalized.retryAfterSeconds:Math.min(3600,30*2**(row.attempt_count-1));
    await client.query(`UPDATE public.member_denial_attempts SET finished_at=now(),outcome=$3,failure_code=$4,provider_reference=$5
      WHERE command_id=$1 AND attempt_number=$2`,[row.command_id,row.attempt_count,normalized.status,'code' in normalized?normalized.code:null,reference]);
    await client.query(`UPDATE public.member_denial_jobs SET status=$2,failure_code=$3,provider_reference=coalesce($4,provider_reference),
      lease_token=NULL,lease_expires_at=NULL,next_attempt_at=now()+($5*interval '1 second'),updated_at=now() WHERE command_id=$1`,[row.command_id,status,code,reference,delay]);
  });
}
/** Denial only: provisioning/resume must wait for their entitlement and activation boundary. */
export async function dispatchMemberDenial(url:string,organizationId:OrganizationId,registration:{productId:ProductId;adapter:ProductAdapterV1}):Promise<'idle'|'processed'> {
  assertProductAdapterV1(registration.adapter);
  const lease=await claimMemberDenial(url,organizationId,registration.productId);if(!lease)return 'idle';
  let timer:ReturnType<typeof setTimeout>|undefined;let result:Receipt;
  try {
    const raw=await Promise.race([registration.adapter[lease.operation]({organizationId,productInstanceId:ProductInstanceIdSchema.parse(lease.productInstanceId),
      membershipId:MembershipIdSchema.parse(lease.membershipId),idempotencyKey:lease.idempotencyKey}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Adapter deadline exceeded')),60000);})]);
    const parsed=Response.safeParse(raw);result=parsed.success?parsed.data:{status:'permanent_failure',code:'invalid_adapter_response'};
  } catch {result={status:'retryable_failure',code:'adapter_transport_failure'};} finally {if(timer)clearTimeout(timer);}
  await finishMemberDenial(url,organizationId,lease,result);return 'processed';
}
