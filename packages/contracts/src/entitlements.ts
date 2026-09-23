import { z } from "zod";
import { EntitlementIdSchema, OrganizationIdSchema, ProductInstanceIdSchema, MembershipIdSchema } from "./ids.js";
export const ProductCapabilityKeySchema=z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/);
export const EntitlementEffectSchema=z.enum(["allow","deny","inherit"]);
/** Configuration intent. This is not an effective access/usage authorization. */
export const EntitlementRevisionV1Schema=z.object({
  schemaVersion:z.literal(1),entitlementId:EntitlementIdSchema,organizationId:OrganizationIdSchema,
  productInstanceId:ProductInstanceIdSchema,membershipId:MembershipIdSchema.nullable(),
  capability:ProductCapabilityKeySchema,revision:z.number().int().positive().max(2147483647),effect:EntitlementEffectSchema,
}).strict();
export type EntitlementRevisionV1=z.infer<typeof EntitlementRevisionV1Schema>;
/** Resolve configuration only. The Phase 03 resolver must additionally check every runtime gate. */
export function requestedEntitlementEffect(organizationDefault:z.infer<typeof EntitlementEffectSchema>|null,memberOverride:z.infer<typeof EntitlementEffectSchema>|null):"allow"|"deny" {
  const org=EntitlementEffectSchema.nullable().parse(organizationDefault);
  const member=EntitlementEffectSchema.nullable().parse(memberOverride);
  if(org==='deny'||member==='deny')return 'deny';
  return member==='allow'||org==='allow'?'allow':'deny';
}
