import { z } from "zod";
import {
  MembershipIdSchema, OrganizationIdSchema, ProductIdSchema, ProductInstanceIdSchema,
  TeamIdSchema, BudgetIdSchema,
} from "./ids.js";
import { ProductCapabilityKeySchema } from "./entitlements.js";
import { MeterDefinitionV1Schema } from "./usage-events.js";
import { LimitQuantitySchema, LimitWindowSchema } from "./usage-limits.js";

/** One exact meter quantity within one product. This contract does not model money. */
const MeterBindingSchema = z.object({
  meterKey: ProductCapabilityKeySchema,
  meterVersion: MeterDefinitionV1Schema.shape.version,
  unit: MeterDefinitionV1Schema.shape.unit,
}).strict();

export const BudgetPolicyActionV1Schema = z.enum([
  "informational", "warning", "manager_approval", "soft_pause", "hard_stop", "emergency_shutdown",
]);
export type BudgetPolicyActionV1 = z.infer<typeof BudgetPolicyActionV1Schema>;

export const BudgetPolicyScopeV1Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("organization") }).strict(),
  z.object({ kind: z.literal("product"), productId: ProductIdSchema }).strict(),
  z.object({ kind: z.literal("product_instance"), productInstanceId: ProductInstanceIdSchema }).strict(),
  z.object({ kind: z.literal("team"), teamId: TeamIdSchema }).strict(),
  z.object({ kind: z.literal("member"), membershipId: MembershipIdSchema }).strict(),
  z.object({ kind: z.literal("capability"), capabilityKey: ProductCapabilityKeySchema }).strict(),
  z.object({ kind: z.literal("meter") }).strict(),
]);

/** Every row is tenant and product bound, even for organization scope. That keeps
 * unlike product meters from becoming an accidental shared numeric budget.
 * Cross-product currency budgets require a separate contract and valuation model.
 */
export const BudgetPolicyV1Schema = z.object({
  schemaVersion: z.literal(1),
  policyId: BudgetIdSchema,
  revision: z.number().int().positive().max(2147483647),
  organizationId: OrganizationIdSchema,
  productId: ProductIdSchema,
  meter: MeterBindingSchema,
  window: LimitWindowSchema,
  maximumQuantity: LimitQuantitySchema,
  action: BudgetPolicyActionV1Schema,
  scope: BudgetPolicyScopeV1Schema,
}).strict();
export type BudgetPolicyV1 = z.infer<typeof BudgetPolicyV1Schema>;

/** The caller must verify operation team membership with the database.
 * This shape deliberately carries no claim that such verification occurred.
 */
export const BudgetOperationV1Schema = z.object({
  schemaVersion: z.literal(1),
  organizationId: OrganizationIdSchema,
  productId: ProductIdSchema,
  productInstanceId: ProductInstanceIdSchema,
  membershipId: MembershipIdSchema.nullable(),
  operationTeam: z.object({
    teamId: TeamIdSchema,
    organizationId: OrganizationIdSchema,
    membershipId: MembershipIdSchema.nullable(),
  }).strict().nullable(),
  capabilityKey: ProductCapabilityKeySchema.nullable(),
  meter: MeterBindingSchema,
}).strict();
export type BudgetOperationV1 = z.infer<typeof BudgetOperationV1Schema>;

export type ResolvedBudgetConstraintV1 = Pick<BudgetPolicyV1, "policyId" | "revision" | "scope" | "window" | "maximumQuantity" | "action">;
export type ResolvedBudgetWindowV1 = {
  window: BudgetPolicyV1["window"];
  /** First configured threshold only. Each constraint retains its own action. */
  earliestThresholdQuantity: string;
  bindingPolicyIds: BudgetPolicyV1["policyId"][];
};
export type BudgetResolutionV1 = {
  schemaVersion: 1;
  meter: z.infer<typeof MeterBindingSchema>;
  constraints: ResolvedBudgetConstraintV1[];
  windows: ResolvedBudgetWindowV1[];
};

const SCOPE_ORDER: Readonly<Record<BudgetPolicyV1["scope"]["kind"], number>> = {
  organization: 0, product: 1, product_instance: 2, team: 3, member: 4, capability: 5, meter: 6,
};
const WINDOW_ORDER: Readonly<Record<BudgetPolicyV1["window"], number>> = {
  utc_day: 0, utc_week: 1, utc_month: 2,
};

function scaledQuantity(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
}

function isApplicable(policy: BudgetPolicyV1, operation: BudgetOperationV1): boolean {
  switch (policy.scope.kind) {
    case "organization": case "meter": return true;
    case "product": return policy.scope.productId === operation.productId;
    case "product_instance": return policy.scope.productInstanceId === operation.productInstanceId;
    case "team": return operation.operationTeam!.teamId === policy.scope.teamId;
    case "member": return policy.scope.membershipId === operation.membershipId;
    case "capability": return policy.scope.capabilityKey === operation.capabilityKey;
  }
}

/** Resolve a caller-supplied candidate set. The caller must fetch all relevant
 * policies under tenant authorization; this function never grants access or
 * proves provider enforcement. It rejects mixed meter sets and ambiguous
 * attribution instead of producing a permissive partial result.
 */
export function resolveBudgetPoliciesV1(
  operationInput: unknown, candidateInputs: readonly unknown[],
): BudgetResolutionV1 {
  const operation = BudgetOperationV1Schema.parse(operationInput);
  const candidates = candidateInputs.map(candidate => BudgetPolicyV1Schema.parse(candidate));
  const ids = new Set<string>();
  for (const policy of candidates) {
    if (ids.has(policy.policyId)) throw new Error("Duplicate budget policy identity in candidate set");
    ids.add(policy.policyId);
    if (policy.organizationId !== operation.organizationId || policy.productId !== operation.productId) {
      throw new Error("Budget policy candidate crosses organization or product boundary");
    }
    if (policy.meter.meterKey !== operation.meter.meterKey ||
        policy.meter.meterVersion !== operation.meter.meterVersion ||
        policy.meter.unit !== operation.meter.unit) {
      throw new Error("Budget policy candidate has a different meter, version, or unit");
    }
  }
  if (operation.operationTeam && (operation.operationTeam.organizationId !== operation.organizationId ||
      operation.operationTeam.membershipId !== operation.membershipId)) {
    throw new Error("Team attribution crosses organization or membership boundary");
  }
  if (candidates.some(policy => policy.scope.kind === "team") && !operation.operationTeam) {
    throw new Error("Team budget requires explicit operation team attribution");
  }
  if (candidates.some(policy => policy.scope.kind === "member") && !operation.membershipId) {
    throw new Error("Member budget requires explicit member attribution");
  }
  if (candidates.some(policy => policy.scope.kind === "capability") && !operation.capabilityKey) {
    throw new Error("Capability budget requires explicit capability attribution");
  }

  const applicable = candidates.filter(policy => isApplicable(policy, operation));
  applicable.sort((a, b) => WINDOW_ORDER[a.window] - WINDOW_ORDER[b.window] ||
    SCOPE_ORDER[a.scope.kind] - SCOPE_ORDER[b.scope.kind] || a.policyId.localeCompare(b.policyId));
  const constraints = applicable.map(({ policyId, revision, scope, window, maximumQuantity, action }) =>
    ({ policyId, revision, scope, window, maximumQuantity, action }));
  const windows: ResolvedBudgetWindowV1[] = [];
  for (const window of LimitWindowSchema.options) {
    const group = applicable.filter(policy => policy.window === window);
    const first = group[0];
    if (!first) continue;
    const strictest = group.reduce((min, policy) => scaledQuantity(policy.maximumQuantity) < min
      ? scaledQuantity(policy.maximumQuantity) : min, scaledQuantity(first.maximumQuantity));
    const binding = group.filter(policy => scaledQuantity(policy.maximumQuantity) === strictest);
    windows.push({ window, earliestThresholdQuantity: binding[0]!.maximumQuantity,
      bindingPolicyIds: binding.map(policy => policy.policyId) });
  }
  return { schemaVersion: 1, meter: operation.meter, constraints, windows };
}
