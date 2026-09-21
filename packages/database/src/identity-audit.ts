import { randomUUID } from "node:crypto";
import { AuditEnvelopeV1Schema, createCanonicalId, type MembershipId, type OrganizationId, type UserId } from "@company-human/contracts";
import type { Client } from "pg";

export interface IdentityAuditChange {
  organizationId: OrganizationId;
  actorUserId: UserId;
  actorMembershipId?: MembershipId;
  action: string;
  targetType: string;
  targetId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  requestId?: string;
}

/** Call inside the same transaction as the mutation; audit failure rolls it back. */
export async function appendIdentityAudit(client: Client, change: IdentityAuditChange): Promise<void> {
  const auditId = createCanonicalId("audit");
  const envelope = AuditEnvelopeV1Schema.parse({
    schemaVersion: 1,
    auditId,
    organizationId: change.organizationId,
    actor: { type: "human", userId: change.actorUserId, membershipId: change.actorMembershipId },
    action: change.action,
    target: { type: change.targetType, id: change.targetId },
    beforeRef: change.beforeState ? `${auditId}:before` : undefined,
    afterRef: change.afterState ? `${auditId}:after` : undefined,
    requestId: change.requestId ?? randomUUID(),
    occurredAt: new Date().toISOString(),
  });
  await client.query(
    `INSERT INTO public.identity_audit_events
     (id, organization_id, actor_user_id, actor_membership_id, action, target_type, target_id,
      request_id, before_state, after_state, envelope, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      auditId, change.organizationId, change.actorUserId, change.actorMembershipId ?? null,
      change.action, change.targetType, change.targetId, envelope.requestId,
      change.beforeState ? JSON.stringify(change.beforeState) : null,
      change.afterState ? JSON.stringify(change.afterState) : null,
      JSON.stringify(envelope), envelope.occurredAt,
    ],
  );
}

/** A service records its own execution, retaining the initiating human on the linked command. */
export async function appendServiceAudit(client: Client, change: {
  organizationId: OrganizationId; serviceId: string; action: string; targetType: string; targetId: string;
  afterState: Record<string, unknown>;
}): Promise<void> {
  const auditId=createCanonicalId("audit");
  const envelope=AuditEnvelopeV1Schema.parse({schemaVersion:1,auditId,organizationId:change.organizationId,
    actor:{type:"service",id:change.serviceId},action:change.action,target:{type:change.targetType,id:change.targetId},
    afterRef:`${auditId}:after`,requestId:randomUUID(),occurredAt:new Date().toISOString()});
  await client.query(`INSERT INTO public.identity_audit_events
    (id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
    VALUES ($1,$2,'service',$3,$4,$5,$6,$7,$8,$9,$10)`,[auditId,change.organizationId,change.serviceId,change.action,
    change.targetType,change.targetId,envelope.requestId,JSON.stringify(change.afterState),JSON.stringify(envelope),envelope.occurredAt]);
}
