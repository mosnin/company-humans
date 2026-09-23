import { z } from "zod";

/** An ID is globally unique, typed by prefix, and independent of provider IDs. */
export const ID_SCHEMA_VERSION = 1 as const;
const UUID_HEX = "[0-9a-f]{32}";

export const UserIdSchema = z.string().regex(new RegExp(`^ch_usr_${UUID_HEX}$`)).brand<"UserId">();
export const OrganizationIdSchema = z.string().regex(new RegExp(`^ch_org_${UUID_HEX}$`)).brand<"OrganizationId">();
export const MembershipIdSchema = z.string().regex(new RegExp(`^ch_mem_${UUID_HEX}$`)).brand<"MembershipId">();
export const InvitationIdSchema = z.string().regex(new RegExp(`^ch_inv_${UUID_HEX}$`)).brand<"InvitationId">();
export const TeamIdSchema = z.string().regex(new RegExp(`^ch_team_${UUID_HEX}$`)).brand<"TeamId">();
export const RoleIdSchema = z.string().regex(new RegExp(`^ch_role_${UUID_HEX}$`)).brand<"RoleId">();
export const ProductIdSchema = z.string().regex(new RegExp(`^ch_prod_${UUID_HEX}$`)).brand<"ProductId">();
export const ProductInstanceIdSchema = z.string().regex(new RegExp(`^ch_inst_${UUID_HEX}$`)).brand<"ProductInstanceId">();
export const ProductMembershipIdSchema = z.string().regex(new RegExp(`^ch_pmem_${UUID_HEX}$`)).brand<"ProductMembershipId">();
export const UsageLimitIdSchema = z.string().regex(new RegExp(`^ch_lim_${UUID_HEX}$`)).brand<"UsageLimitId">();
export const BudgetIdSchema = z.string().regex(new RegExp(`^ch_bud_${UUID_HEX}$`)).brand<"BudgetId">();
export const EntitlementIdSchema = z.string().regex(new RegExp(`^ch_ent_${UUID_HEX}$`)).brand<"EntitlementId">();
export const ProvisioningOperationIdSchema = z.string().regex(new RegExp(`^ch_op_${UUID_HEX}$`)).brand<"ProvisioningOperationId">();
export const EventIdSchema = z.string().regex(new RegExp(`^ch_evt_${UUID_HEX}$`)).brand<"EventId">();
export const AuditIdSchema = z.string().regex(new RegExp(`^ch_aud_${UUID_HEX}$`)).brand<"AuditId">();

export type UserId = z.infer<typeof UserIdSchema>;
export type OrganizationId = z.infer<typeof OrganizationIdSchema>;
export type MembershipId = z.infer<typeof MembershipIdSchema>;
export type InvitationId = z.infer<typeof InvitationIdSchema>;
export type TeamId = z.infer<typeof TeamIdSchema>;
export type RoleId = z.infer<typeof RoleIdSchema>;
export type ProductId = z.infer<typeof ProductIdSchema>;
export type ProductInstanceId = z.infer<typeof ProductInstanceIdSchema>;
export type ProductMembershipId = z.infer<typeof ProductMembershipIdSchema>;
export type UsageLimitId = z.infer<typeof UsageLimitIdSchema>;
export type BudgetId = z.infer<typeof BudgetIdSchema>;
export type EntitlementId = z.infer<typeof EntitlementIdSchema>;
export type ProvisioningOperationId = z.infer<typeof ProvisioningOperationIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
export type AuditId = z.infer<typeof AuditIdSchema>;

const schemas = {
  user: UserIdSchema,
  organization: OrganizationIdSchema,
  membership: MembershipIdSchema,
  invitation: InvitationIdSchema,
  team: TeamIdSchema,
  role: RoleIdSchema,
  product: ProductIdSchema,
  productInstance: ProductInstanceIdSchema,
  productMembership: ProductMembershipIdSchema,
  usageLimit: UsageLimitIdSchema,
  budget: BudgetIdSchema,
  entitlement: EntitlementIdSchema,
  provisioningOperation: ProvisioningOperationIdSchema,
  event: EventIdSchema,
  audit: AuditIdSchema,
} as const;

const prefixes = {
  user: "usr",
  organization: "org",
  membership: "mem",
  invitation: "inv",
  team: "team",
  role: "role",
  product: "prod",
  productInstance: "inst",
  productMembership: "pmem",
  usageLimit: "lim",
  budget: "bud",
  entitlement: "ent",
  provisioningOperation: "op",
  event: "evt",
  audit: "aud",
} as const;

export type CanonicalIdKind = keyof typeof schemas;
export type CanonicalId<K extends CanonicalIdKind> = z.infer<(typeof schemas)[K]>;

export function createCanonicalId<K extends CanonicalIdKind>(kind: K): CanonicalId<K> {
  const value = `ch_${prefixes[kind]}_${crypto.randomUUID().replaceAll("-", "")}`;
  return schemas[kind].parse(value) as CanonicalId<K>;
}

/** Version is part of every serialized cross-service identifier reference. */
export const CanonicalIdReferenceV1Schema = z.discriminatedUnion("kind", [
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("user"), id: UserIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("organization"), id: OrganizationIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("membership"), id: MembershipIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("invitation"), id: InvitationIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("team"), id: TeamIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("role"), id: RoleIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("product"), id: ProductIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("productInstance"), id: ProductInstanceIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("productMembership"), id: ProductMembershipIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("usageLimit"), id: UsageLimitIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("budget"), id: BudgetIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("entitlement"), id: EntitlementIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("provisioningOperation"), id: ProvisioningOperationIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("event"), id: EventIdSchema }),
  z.object({ schemaVersion: z.literal(ID_SCHEMA_VERSION), kind: z.literal("audit"), id: AuditIdSchema }),
]);
