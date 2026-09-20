import { z } from "zod";
import { AuditIdSchema, EventIdSchema, MembershipIdSchema, OrganizationIdSchema, ProductIdSchema, UserIdSchema } from "./ids.js";

export const ENVELOPE_SCHEMA_VERSION = 1 as const;
const TimestampSchema = z.iso.datetime({ offset: true });
const SlugSchema = z.string().regex(/^[a-z][a-z0-9._-]*$/);
const OpaqueReferenceSchema = z.string().min(1).max(256);

export const ActorV1Schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("human"), userId: UserIdSchema, membershipId: MembershipIdSchema.optional() }),
  z.object({ type: z.literal("agent"), id: OpaqueReferenceSchema }),
  z.object({ type: z.literal("service"), id: OpaqueReferenceSchema }),
  z.object({ type: z.literal("integration"), id: OpaqueReferenceSchema }),
]);

export const EventEnvelopeV1Schema = z.object({
  schemaVersion: z.literal(ENVELOPE_SCHEMA_VERSION),
  eventId: EventIdSchema,
  organizationId: OrganizationIdSchema,
  eventType: SlugSchema,
  source: z.object({ system: SlugSchema, eventId: OpaqueReferenceSchema }),
  productId: ProductIdSchema.optional(),
  actor: ActorV1Schema,
  environment: z.enum(["test", "production"]),
  occurredAt: TimestampSchema,
  reportedAt: TimestampSchema,
  idempotencyKey: OpaqueReferenceSchema,
  payload: z.record(z.string(), z.json()),
}).strict();

export const AuditEnvelopeV1Schema = z.object({
  schemaVersion: z.literal(ENVELOPE_SCHEMA_VERSION),
  auditId: AuditIdSchema,
  organizationId: OrganizationIdSchema,
  actor: ActorV1Schema,
  action: SlugSchema,
  target: z.object({ type: SlugSchema, id: OpaqueReferenceSchema }),
  beforeRef: OpaqueReferenceSchema.optional(),
  afterRef: OpaqueReferenceSchema.optional(),
  requestId: OpaqueReferenceSchema,
  ipAddress: z.ipv4().or(z.ipv6()).optional(),
  occurredAt: TimestampSchema,
}).strict();

export const EnvelopeSignatureV1Schema = z.object({
  algorithm: z.literal("hmac-sha256"),
  keyId: SlugSchema,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const SignedEventEnvelopeV1Schema = EventEnvelopeV1Schema.extend({ signature: EnvelopeSignatureV1Schema });
export const SignedAuditEnvelopeV1Schema = AuditEnvelopeV1Schema.extend({ signature: EnvelopeSignatureV1Schema });

export type EventEnvelopeV1 = z.infer<typeof EventEnvelopeV1Schema>;
export type AuditEnvelopeV1 = z.infer<typeof AuditEnvelopeV1Schema>;
export type SignedEventEnvelopeV1 = z.infer<typeof SignedEventEnvelopeV1Schema>;
export type SignedAuditEnvelopeV1 = z.infer<typeof SignedAuditEnvelopeV1Schema>;
