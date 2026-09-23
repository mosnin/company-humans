import { appendServiceAudit } from "./identity-audit.js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";
import { OrganizationIdSchema, ProductIdSchema, ProductInstanceIdSchema, MembershipIdSchema, ProvisioningOperationIdSchema,
  SuspendedMemberProvisionResultSchema, assertProductAdapterV2, type OrganizationId, type ProductId, type ProductAdapterV2 } from "@company-human/contracts";
const Response=SuspendedMemberProvisionResultSchema;
type Receipt=z.infer<typeof Response>;
interface Row {command_id:string;product_instance_id:string;membership_id:string;operation:"provisionMember";
  idempotency_key:string;attempt_count:number;status:string;lease_token:string|null;expired:boolean;current_revision:boolean;external_member_id:string|null;}
export interface MemberBootstrapLease { commandId:string;productInstanceId:string;membershipId:string;operation:"provisionMember";
  idempotencyKey:string;leaseToken:string;attemptNumber:number; }
async function transaction<T>(url:string,organizationId:OrganizationId,run:(client:Client)=>Promise<T>):Promise<T> {
  OrganizationIdSchema.parse(organizationId);
  const client=new Client({connectionString:url});await client.connect();
  try {
    await client.query("BEGIN");
    const role=await client.query<{allowed:boolean}>(`SELECT pg_has_role(current_user,'company_human_bootstrap_worker','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND NOT pg_has_role(current_user,'company_human_service','member')
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.member_bootstrap_jobs'::regclass),'member') AS allowed
      FROM pg_roles r WHERE rolname=current_user`);
    if(!role.rows[0]?.allowed) throw new Error("Member bootstrap requires a restricted worker role");
    await client.query("SELECT set_config('company_human.organization_id',$1,true)",[organizationId]);
    const value=await run(client);await client.query("COMMIT");return value;
  } catch(error) {await client.query("ROLLBACK");throw error;} finally {await client.end();}
}
/** Trusted server/job scope only. This is deliberately not a public endpoint. */
export async function claimMemberBootstrap(url:string,organizationId:OrganizationId,productId:ProductId):Promise<MemberBootstrapLease|null> {
  ProductIdSchema.parse(productId);
  return transaction(url,organizationId,async client=>{
    // Serialize claims per tenant/product, including first job insertion.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`member-bootstrap:${organizationId}:${productId}`]);
    await client.query(`INSERT INTO public.member_bootstrap_jobs (command_id,organization_id)
      SELECT c.id,c.organization_id FROM public.product_membership_commands c
      JOIN public.product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
      JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
      JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
      JOIN public.users u ON u.id=m.user_id
      JOIN public.organizations o ON o.id=pm.organization_id
      JOIN public.products p ON p.id=i.product_id
      WHERE c.organization_id=$1 AND i.product_id=$2 AND c.operation IN ('provisionMember')
        AND c.desired_revision=pm.desired_revision AND pm.desired_enabled AND NOT pm.policy_blocked
        AND m.status='active' AND u.status='active' AND o.status='active'
        AND i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status='ready'
        AND company_human_private.bootstrap_missing_product_permission(c.organization_id,m.role_id,i.product_id) IS NULL
      ON CONFLICT (command_id) DO NOTHING`,[organizationId,productId]);
    const result=await client.query<Row>(`SELECT j.*,c.operation,c.idempotency_key,pm.product_instance_id,pm.membership_id,
      j.lease_expires_at<=clock_timestamp() AS expired,(c.desired_revision=pm.desired_revision AND pm.desired_enabled AND NOT pm.policy_blocked
        AND m.status='active' AND u.status='active' AND o.status='active' AND i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status='ready'
        AND company_human_private.bootstrap_missing_product_permission(c.organization_id,m.role_id,i.product_id) IS NULL) AS current_revision
      FROM public.member_bootstrap_jobs j JOIN public.product_membership_commands c ON c.id=j.command_id AND c.organization_id=j.organization_id
      JOIN public.product_memberships pm ON pm.id=c.product_membership_id AND pm.organization_id=c.organization_id
      JOIN public.product_instances i ON i.id=pm.product_instance_id AND i.organization_id=pm.organization_id
      JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
      JOIN public.users u ON u.id=m.user_id
      JOIN public.organizations o ON o.id=pm.organization_id
      JOIN public.products p ON p.id=i.product_id
      WHERE j.organization_id=$1 AND i.product_id=$2
        AND ((j.status IN ('pending','retry_wait') AND j.next_attempt_at<=now()) OR (j.status='running' AND j.lease_expires_at<=now()))
        AND NOT EXISTS (SELECT 1 FROM public.member_bootstrap_jobs other JOIN public.product_membership_commands oc
          ON oc.id=other.command_id AND oc.organization_id=other.organization_id
          WHERE oc.product_membership_id=pm.id AND other.command_id<>j.command_id AND other.status='running' AND other.lease_expires_at>now())
      ORDER BY c.desired_revision,j.command_id FOR UPDATE OF j SKIP LOCKED LIMIT 1`,[organizationId,productId]);
    const row=result.rows[0];if(!row)return null;
    if(row.status==='running') await client.query(`UPDATE public.member_bootstrap_attempts SET finished_at=now(),outcome='lease_expired',failure_code='worker_lease_expired'
      WHERE command_id=$1 AND attempt_number=$2 AND finished_at IS NULL`,[row.command_id,row.attempt_count]);
    if(!row.current_revision || row.attempt_count>=5) {
      await client.query(`UPDATE public.member_bootstrap_jobs SET status=$2,failure_code=$3,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE command_id=$1`,
        [row.command_id,row.current_revision?'failed':'superseded',row.current_revision?'retry_exhausted':'superseded_revision']);
      await appendServiceAudit(client,{organizationId,serviceId:"member-bootstrap-worker",
        action:row.current_revision?"product.member_bootstrap.exhausted":"product.member_bootstrap.superseded",
        targetType:"product_membership_command",targetId:row.command_id,afterState:{attemptNumber:row.attempt_count}});
      return null;
    }
    const leaseToken=randomUUID(),attemptNumber=row.attempt_count+1;
    await client.query(`UPDATE public.member_bootstrap_jobs SET status='running',attempt_count=$2,lease_token=$3,lease_expires_at=now()+interval '2 minutes',updated_at=now() WHERE command_id=$1`,[row.command_id,attemptNumber,leaseToken]);
    await client.query(`INSERT INTO public.member_bootstrap_attempts (organization_id,command_id,attempt_number,lease_token) VALUES ($1,$2,$3,$4)`,[organizationId,row.command_id,attemptNumber,leaseToken]);
    await appendServiceAudit(client,{organizationId,serviceId:"member-bootstrap-worker",action:"product.member_bootstrap.claimed",
      targetType:"product_membership_command",targetId:row.command_id,afterState:{attemptNumber}});
    return {commandId:row.command_id,productInstanceId:row.product_instance_id,membershipId:row.membership_id,operation:row.operation,
      idempotencyKey:row.idempotency_key,leaseToken,attemptNumber};
  });
}
export async function finishMemberBootstrap(url:string,organizationId:OrganizationId,lease:MemberBootstrapLease,raw:Receipt):Promise<void> {
  ProvisioningOperationIdSchema.parse(lease.commandId);z.uuid().parse(lease.leaseToken);
  const receipt=Response.parse(raw);
  await transaction(url,organizationId,async client=>{
    const result=await client.query<Row>(`SELECT j.*,c.operation,pm.external_member_id,(c.desired_revision=pm.desired_revision AND pm.desired_enabled AND NOT pm.policy_blocked
      AND m.status='active' AND u.status='active' AND o.status='active' AND i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status='ready'
      AND company_human_private.bootstrap_missing_product_permission(c.organization_id,m.role_id,i.product_id) IS NULL) AS current_revision,
      j.lease_expires_at<=clock_timestamp() AS expired FROM public.member_bootstrap_jobs j
      JOIN public.product_membership_commands c ON c.id=j.command_id AND c.organization_id=j.organization_id
      JOIN public.product_memberships pm ON pm.id=c.product_membership_id AND pm.organization_id=c.organization_id
      JOIN public.product_instances i ON i.id=pm.product_instance_id AND i.organization_id=pm.organization_id
      JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
      JOIN public.users u ON u.id=m.user_id
      JOIN public.organizations o ON o.id=pm.organization_id
      JOIN public.products p ON p.id=i.product_id
      WHERE j.command_id=$1 AND j.organization_id=$2 FOR UPDATE OF j`,[lease.commandId,organizationId]);
    const row=result.rows[0];if(!row||row.status!=='running'||row.lease_token!==lease.leaseToken||row.expired)throw new Error("Stale member bootstrap lease");
    const wrongMember=receipt.status==='succeeded'&&row.external_member_id!==null&&row.external_member_id!==receipt.value.externalMemberId;
    const normalized:Receipt=wrongMember?{status:'permanent_failure',code:'provider_member_mismatch'}:receipt;
    const retry=normalized.status==='pending'||normalized.status==='retryable_failure';
    let status=!row.current_revision?'superseded':normalized.status==='succeeded'?'succeeded':retry&&row.attempt_count<5?'retry_wait':'failed';
    let code=!row.current_revision?'superseded_revision':retry&&row.attempt_count>=5?'retry_exhausted':'code' in normalized?normalized.code:null;
    const reference=normalized.status==='succeeded'?normalized.value.externalMemberId:normalized.status==='pending'?normalized.operationId:null;
    const delay=normalized.status==='retryable_failure'&&normalized.retryAfterSeconds?normalized.retryAfterSeconds:Math.min(3600,30*2**(row.attempt_count-1));
    await client.query(`UPDATE public.member_bootstrap_attempts SET finished_at=now(),outcome=$3,failure_code=$4,provider_reference=$5
      WHERE command_id=$1 AND attempt_number=$2`,[row.command_id,row.attempt_count,normalized.status,'code' in normalized?normalized.code:null,reference]);
    if (row.current_revision && normalized.status === 'succeeded') {
      const binding = await client.query<{ bound: boolean }>(
        "SELECT company_human_private.bind_suspended_product_member($1,$2) AS bound", [row.command_id, lease.leaseToken]);
      if (!binding.rows[0]?.bound) { status = 'failed'; code = 'provider_binding_rejected'; }
    }
    await client.query(`UPDATE public.member_bootstrap_jobs SET status=$2,failure_code=$3,provider_reference=coalesce($4,provider_reference),
      lease_token=NULL,lease_expires_at=NULL,next_attempt_at=now()+($5*interval '1 second'),updated_at=now() WHERE command_id=$1`,[row.command_id,status,code,reference,delay]);
    await appendServiceAudit(client,{organizationId,serviceId:"member-bootstrap-worker",action:"product.member_bootstrap.received",
      targetType:"product_membership_command",targetId:row.command_id,afterState:{status,outcome:normalized.status,code,attemptNumber:row.attempt_count}});
  });
}
/** Suspended identity only: this never resumes access or applies an effective grant. */
export async function dispatchMemberBootstrap(url:string,organizationId:OrganizationId,registration:{productId:ProductId;adapter:ProductAdapterV2}):Promise<'idle'|'processed'> {
  assertProductAdapterV2(registration.adapter);
  const lease=await claimMemberBootstrap(url,organizationId,registration.productId);if(!lease)return 'idle';
  let timer:ReturnType<typeof setTimeout>|undefined;let result:Receipt;
  try {
    const raw=await Promise.race([registration.adapter[lease.operation]({organizationId,productInstanceId:ProductInstanceIdSchema.parse(lease.productInstanceId),
      membershipId:MembershipIdSchema.parse(lease.membershipId),idempotencyKey:lease.idempotencyKey,initialAccess:"suspended"}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Adapter deadline exceeded')),60000);})]);
    const parsed=Response.safeParse(raw);result=parsed.success?parsed.data:{status:'permanent_failure',code:'invalid_adapter_response'};
  } catch {result={status:'retryable_failure',code:'adapter_transport_failure'};} finally {if(timer)clearTimeout(timer);}
  await finishMemberBootstrap(url,organizationId,lease,result);return 'processed';
}
