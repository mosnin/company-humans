import { appendServiceAudit } from "./identity-audit.js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";
import { OrganizationIdSchema, ProductIdSchema, ProvisioningOperationIdSchema,
  MemberAccessCommandSchema, type MemberAccessCommand, type OrganizationId, type ProductId } from "@company-human/contracts";
const Code=z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/);
const Response=z.discriminatedUnion("status",[
  z.object({status:z.literal("succeeded"),value:z.object({externalMemberId:z.string().min(1).max(512),status:z.enum(["active","suspended","removed"])}).strict()}).strict(),
  z.object({status:z.literal("pending"),operationId:z.string().min(1).max(512)}).strict(),
  z.object({status:z.literal("retryable_failure"),code:Code,retryAfterSeconds:z.number().int().min(1).max(86400).optional()}).strict(),
  z.object({status:z.literal("permanent_failure"),code:Code}).strict(),
]);
type Receipt=z.infer<typeof Response>;
interface Row {command_id:string;product_instance_id:string;membership_id:string;operation:"suspendMember"|"removeMember";
  idempotency_key:string;attempt_count:number;status:string;lease_token:string|null;expired:boolean;current_revision:boolean;external_member_id:string|null;access_revision:string;external_organization_id:string|null;binding_member_id:string|null;binding_current:boolean;fence_current:boolean;source_policy:unknown|null;source_authorization:unknown|null;}
export interface MemberDenialLease { commandId:string;productInstanceId:string;membershipId:string;operation:"suspendMember"|"removeMember";
  idempotencyKey:string;leaseToken:string;attemptNumber:number; accessCommand?:MemberAccessCommand; bindingFailure?:"provider_binding_reconciliation_required"; }
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
export async function claimMemberDenial(url:string,organizationId:OrganizationId,productId:ProductId,fencedOnly=false):Promise<MemberDenialLease|null> {
  ProductIdSchema.parse(productId);
  return transaction(url,organizationId,async client=>{
    // Serialize claims per tenant/product, including first job insertion.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`member-denial:${organizationId}:${productId}`]);
    await client.query(`INSERT INTO public.member_denial_jobs (command_id,organization_id)
      SELECT c.id,c.organization_id FROM public.product_membership_commands c
      JOIN public.product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
      JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
      WHERE c.organization_id=$1 AND i.product_id=$2 AND c.operation IN ('suspendMember','removeMember')
        AND c.desired_revision=pm.desired_revision AND (NOT pm.desired_enabled OR pm.policy_blocked)
      ON CONFLICT (command_id) DO NOTHING`,[organizationId,productId]);
    const result=await client.query<Row>(`SELECT j.*,c.operation,c.idempotency_key,pm.product_instance_id,pm.membership_id,a.access_revision,a.external_organization_id,a.external_member_id AS binding_member_id,
      (a.external_member_id IS NOT NULL AND a.external_organization_id IS NOT NULL AND a.external_member_id=pm.external_member_id AND a.external_organization_id=i.external_organization_id) AS binding_current,
      (a.access_revision=pm.access_revision) AS fence_current,
      j.lease_expires_at<=clock_timestamp() AS expired,(c.desired_revision=pm.desired_revision AND (NOT pm.desired_enabled OR pm.policy_blocked)) AS current_revision
      FROM public.member_denial_jobs j JOIN public.product_membership_commands c ON c.id=j.command_id AND c.organization_id=j.organization_id
      JOIN public.member_access_commands a ON a.command_id=c.id AND a.organization_id=c.organization_id
      JOIN public.product_memberships pm ON pm.id=c.product_membership_id AND pm.organization_id=c.organization_id
      JOIN public.product_instances i ON i.id=pm.product_instance_id AND i.organization_id=pm.organization_id
      WHERE j.organization_id=$1 AND i.product_id=$2
        AND ((j.status IN ('pending','retry_wait') AND j.next_attempt_at<=now()) OR (j.status='running' AND j.lease_expires_at<=now()))
        AND ($3::boolean OR NOT EXISTS (SELECT 1 FROM public.member_denial_jobs other JOIN public.product_membership_commands oc
          ON oc.id=other.command_id AND oc.organization_id=other.organization_id
          WHERE oc.product_membership_id=pm.id AND other.command_id<>j.command_id AND other.status='running' AND other.lease_expires_at>now()))
      ORDER BY c.desired_revision,j.command_id FOR UPDATE OF j SKIP LOCKED LIMIT 1`,[organizationId,productId,fencedOnly]);
    const row=result.rows[0];if(!row)return null;
    if(row.status==='running') await client.query(`UPDATE public.member_denial_attempts SET finished_at=now(),outcome='lease_expired',failure_code='worker_lease_expired'
      WHERE command_id=$1 AND attempt_number=$2 AND finished_at IS NULL`,[row.command_id,row.attempt_count]);
    if(fencedOnly && !row.fence_current)row.current_revision=false;
    if(!row.current_revision || row.attempt_count>=5) {
      await client.query(`UPDATE public.member_denial_jobs SET status=$2,failure_code=$3,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE command_id=$1`,
        [row.command_id,row.current_revision?'failed':'superseded',row.current_revision?'retry_exhausted':'superseded_revision']);
      await appendServiceAudit(client,{organizationId,serviceId:"member-denial-worker",
        action:row.current_revision?"product.member_denial.exhausted":"product.member_denial.superseded",
        targetType:"product_membership_command",targetId:row.command_id,afterState:{attemptNumber:row.attempt_count}});
      return null;
    }
    const leaseToken=randomUUID(),attemptNumber=row.attempt_count+1;
    await client.query(`UPDATE public.member_denial_jobs SET status='running',attempt_count=$2,lease_token=$3,lease_expires_at=now()+interval '2 minutes',updated_at=now() WHERE command_id=$1`,[row.command_id,attemptNumber,leaseToken]);
    await client.query(`INSERT INTO public.member_denial_attempts (organization_id,command_id,attempt_number,lease_token) VALUES ($1,$2,$3,$4)`,[organizationId,row.command_id,attemptNumber,leaseToken]);
    await appendServiceAudit(client,{organizationId,serviceId:"member-denial-worker",action:"product.member_denial.claimed",
      targetType:"product_membership_command",targetId:row.command_id,afterState:{attemptNumber}});
    return {commandId:row.command_id,productInstanceId:row.product_instance_id,membershipId:row.membership_id,operation:row.operation,
      idempotencyKey:row.idempotency_key,leaseToken,attemptNumber,
      ...(fencedOnly && !row.binding_current ? {bindingFailure:"provider_binding_reconciliation_required" as const} : fencedOnly ? {accessCommand:MemberAccessCommandSchema.parse({schemaVersion:1,organizationId,productInstanceId:row.product_instance_id,
        membershipId:row.membership_id,target:{externalOrganizationId:row.external_organization_id,externalMemberId:row.binding_member_id},
        accessRevision:Number(row.access_revision),idempotencyKey:row.idempotency_key,access:row.operation==='removeMember'?'removed':'suspended',policy:null})} : {})};
  });
}
export async function finishMemberDenial(url:string,organizationId:OrganizationId,lease:MemberDenialLease,raw:Receipt,accessReceipt?:MemberAccessCommand):Promise<void> {
  ProvisioningOperationIdSchema.parse(lease.commandId);z.uuid().parse(lease.leaseToken);
  const receipt=Response.parse(raw);
  const fencedReceipt=accessReceipt===undefined?undefined:MemberAccessCommandSchema.parse(accessReceipt);
  await transaction(url,organizationId,async client=>{
    const result=await client.query<Row>(`SELECT j.*,c.operation,c.idempotency_key,c.source_policy,c.source_authorization,pm.product_instance_id,pm.membership_id,pm.external_member_id,
      a.access_revision,a.external_organization_id,a.external_member_id AS binding_member_id,
      (a.external_member_id IS NOT NULL AND a.external_organization_id IS NOT NULL AND a.external_member_id=pm.external_member_id AND a.external_organization_id=i.external_organization_id) AS binding_current,
      (a.access_revision=pm.access_revision) AS fence_current,
      (c.desired_revision=pm.desired_revision AND (NOT pm.desired_enabled OR pm.policy_blocked)) AS current_revision,
      j.lease_expires_at<=clock_timestamp() AS expired FROM public.member_denial_jobs j
      JOIN public.product_membership_commands c ON c.id=j.command_id AND c.organization_id=j.organization_id
      JOIN public.product_memberships pm ON pm.id=c.product_membership_id AND pm.organization_id=c.organization_id
      JOIN public.member_access_commands a ON a.command_id=c.id AND a.organization_id=c.organization_id
      JOIN public.product_instances i ON i.id=pm.product_instance_id AND i.organization_id=pm.organization_id
      WHERE j.command_id=$1 AND j.organization_id=$2 FOR UPDATE OF j`,[lease.commandId,organizationId]);
    const row=result.rows[0];if(!row||row.status!=='running'||row.lease_token!==lease.leaseToken||row.expired)throw new Error("Stale member denial lease");
    if(lease.accessCommand){
      const bound=lease.accessCommand;
      if(bound.organizationId!==organizationId||bound.productInstanceId!==row.product_instance_id||bound.membershipId!==row.membership_id
        ||bound.idempotencyKey!==row.idempotency_key||bound.accessRevision!==Number(row.access_revision)
        ||bound.target.externalMemberId!==row.binding_member_id||bound.target.externalOrganizationId!==row.external_organization_id
        ||bound.access!==(row.operation==='removeMember'?'removed':'suspended'))throw new Error('Invalid member access lease binding');
      row.current_revision=row.current_revision&&row.fence_current;
    }
    const changedBinding=lease.accessCommand!==undefined&&!row.binding_current;
    const acceptable=receipt.status!=='succeeded'||(row.operation==='removeMember'?receipt.value.status==='removed':['suspended','removed'].includes(receipt.value.status));
    const wrongMember=receipt.status==='succeeded'&&row.external_member_id!==null&&row.external_member_id!==receipt.value.externalMemberId;
    const missingFence=(row.source_policy!==null||row.source_authorization!==null)&&receipt.status==='succeeded'&&(!lease.accessCommand||!fencedReceipt);
    const normalized:Receipt=missingFence?{status:'permanent_failure',code:'fenced_policy_receipt_required'}:changedBinding?{status:'permanent_failure',code:'provider_binding_reconciliation_required'}:wrongMember?{status:'permanent_failure',code:'provider_member_mismatch'}:acceptable?receipt:{status:'permanent_failure',code:'provider_access_not_denied'};
    const retry=normalized.status==='pending'||normalized.status==='retryable_failure';
    let status=!row.current_revision?'superseded':normalized.status==='succeeded'?'succeeded':retry&&row.attempt_count<5?'retry_wait':'failed';
    let code=!row.current_revision?'superseded_revision':retry&&row.attempt_count>=5?'retry_exhausted':'code' in normalized?normalized.code:null;
    const reference=normalized.status==='succeeded'?normalized.value.externalMemberId:normalized.status==='pending'?normalized.operationId:null;
    const delay=normalized.status==='retryable_failure'&&normalized.retryAfterSeconds?normalized.retryAfterSeconds:Math.min(3600,30*2**(row.attempt_count-1));
    await client.query(`UPDATE public.member_denial_attempts SET finished_at=now(),outcome=$3,failure_code=$4,provider_reference=$5
      WHERE command_id=$1 AND attempt_number=$2`,[row.command_id,row.attempt_count,normalized.status,'code' in normalized?normalized.code:null,reference]);
    if(status==='succeeded'&&lease.accessCommand&&fencedReceipt){
      const projected=await client.query<{projected:boolean}>(`SELECT company_human_private.project_fenced_member_denial($1,$2,$3::jsonb) AS projected`,
        [row.command_id,lease.leaseToken,JSON.stringify(fencedReceipt)]);
      if(!projected.rows[0]?.projected){status='superseded';code='superseded_revision';}
    }
    await client.query(`UPDATE public.member_denial_jobs SET status=$2,failure_code=$3,provider_reference=coalesce($4,provider_reference),
      lease_token=NULL,lease_expires_at=NULL,next_attempt_at=now()+($5*interval '1 second'),updated_at=now() WHERE command_id=$1`,[row.command_id,status,code,reference,delay]);
    await appendServiceAudit(client,{organizationId,serviceId:"member-denial-worker",action:"product.member_denial.received",
      targetType:"product_membership_command",targetId:row.command_id,afterState:{status,outcome:normalized.status,code,attemptNumber:row.attempt_count}});
  });
}
/** All provider denials use the same fenced boundary as future activations. */
export async function dispatchMemberDenial(url:string,organizationId:OrganizationId,registration:{productId:ProductId;adapter:unknown}):Promise<'idle'|'processed'> {
  const { dispatchFencedMemberDenial } = await import('./member-access-worker.js');
  return dispatchFencedMemberDenial(url,organizationId,registration);
}
