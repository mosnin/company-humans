import { z } from "zod";
import { EventEnvelopeV1Schema, EnvelopeSignatureV1Schema } from "./envelopes.js";
import { MembershipIdSchema, ProductIdSchema, ProductInstanceIdSchema, TeamIdSchema } from "./ids.js";
import { ProductCapabilityKeySchema } from "./entitlements.js";
import { LimitQuantitySchema } from "./usage-limits.js";

export const MeterDefinitionV1Schema = z.object({
  schemaVersion: z.literal(1), productId: ProductIdSchema, meterKey: ProductCapabilityKeySchema,
  version: z.number().int().positive().max(2147483647), unit: ProductCapabilityKeySchema,
  aggregation: z.enum(["sum", "maximum", "last"]), displayName: z.string().trim().min(1).max(120),
}).strict();
export const UsagePayloadV1Schema = z.object({
  productInstanceId: ProductInstanceIdSchema,
  membershipId: MembershipIdSchema.nullable(), teamId: TeamIdSchema.nullable(),
  meterKey: ProductCapabilityKeySchema, meterVersion: z.number().int().positive().max(2147483647),
  quantity: LimitQuantitySchema, unit: ProductCapabilityKeySchema,
  sourceCost: z.object({ amount: LimitQuantitySchema, currency: z.string().regex(/^[A-Z]{3}$/), providerReference: z.string().min(1).max(256) }).strict().nullable(),
  customerRateVersion: z.string().min(1).max(128).nullable(),
  metadata: z.record(z.string().max(80), z.json()).refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 16384, "Usage metadata exceeds 16 KiB"),
}).strict();
export const UsageEventV1Schema = EventEnvelopeV1Schema.extend({
  eventType: z.literal("usage.recorded"), productId: ProductIdSchema, payload: UsagePayloadV1Schema,
}).superRefine((event, ctx) => {
  if (event.actor.type === "human" && event.actor.membershipId && event.actor.membershipId !== event.payload.membershipId) {
    ctx.addIssue({ code: "custom", message: "Usage actor membership must match usage attribution", path: ["actor", "membershipId"] });
  }
});
export const SignedUsageEventV1Schema = UsageEventV1Schema.safeExtend({ signature: EnvelopeSignatureV1Schema });
export type UsageEventV1 = z.infer<typeof UsageEventV1Schema>;
