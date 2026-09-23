import { z } from "zod";
import { UsageLimitIdSchema, OrganizationIdSchema, ProductInstanceIdSchema, MembershipIdSchema } from "./ids.js";
import { ProductCapabilityKeySchema } from "./entitlements.js";
/** Exact meter quantities; never money, infinity, a numeric float or an unlimited sentinel. */
export const LimitQuantitySchema = z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/)
  .transform(value => value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value);
export const LimitWindowSchema = z.enum(["utc_day", "utc_week", "utc_month"]);
export const UsageLimitRevisionV1Schema = z.object({
  schemaVersion: z.literal(1), usageLimitId: UsageLimitIdSchema, organizationId: OrganizationIdSchema,
  productInstanceId: ProductInstanceIdSchema, membershipId: MembershipIdSchema.nullable(),
  meterKey: ProductCapabilityKeySchema, unit: ProductCapabilityKeySchema, window: LimitWindowSchema,
  revision: z.number().int().positive().max(2147483647), maximumQuantity: LimitQuantitySchema,
}).strict();
export type UsageLimitRevisionV1 = z.infer<typeof UsageLimitRevisionV1Schema>;
