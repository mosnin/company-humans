import { z } from "zod";
import { UsageLimitRevisionV1Schema } from "./usage-limits.js";
import { assertProductAdapterV2, type ProductAdapterV2 } from "./product-adapter-v2.js";
import type { AdapterResult } from "./product-adapter.js";

export const USAGE_LIMIT_ADAPTER_VERSION = 1 as const;
const ExternalId = z.string().min(1).max(512);
const Target = z.object({ externalOrganizationId: ExternalId, externalMemberId: ExternalId.nullable() }).strict();
const State = z.object({
  schemaVersion: z.literal(1),
  limit: UsageLimitRevisionV1Schema,
  target: Target,
  enforcement: z.literal("hard_stop"),
  accounting: z.literal("preserve_accumulated_usage"),
  scope: z.enum(["organization_aggregate", "member"]),
}).strict();
function scopeAgrees(value: z.infer<typeof State>): boolean {
  return value.limit.membershipId === null
    ? value.target.externalMemberId === null && value.scope === "organization_aggregate"
    : value.target.externalMemberId !== null && value.scope === "member";
}
export const AppliedUsageLimitStateSchema = State.refine(scopeAgrees, { message: "Limit scope and provider target disagree" });
export const ApplyUsageLimitRequestSchema = State.extend({ idempotencyKey: z.string().min(1).max(512) })
  .refine(scopeAgrees, { message: "Limit scope and provider target disagree" });
export type AppliedUsageLimitState = z.infer<typeof AppliedUsageLimitStateSchema>;
export type ApplyUsageLimitRequest = z.infer<typeof ApplyUsageLimitRequestSchema>;

const Code = z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/);
export const UsageLimitAdapterResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("succeeded"), value: AppliedUsageLimitStateSchema }).strict(),
  z.object({ status: z.literal("pending"), operationId: ExternalId }).strict(),
  z.object({ status: z.literal("retryable_failure"), code: Code, retryAfterSeconds: z.number().int().min(1).max(86400).optional() }).strict(),
  z.object({ status: z.literal("permanent_failure"), code: Code }).strict(),
]);

/** Additive extension: legacy applyLimits cannot stand in for these exact semantics. */
export interface ProductUsageLimitAdapterV1 extends ProductAdapterV2 {
  readonly usageLimitContractVersion: typeof USAGE_LIMIT_ADAPTER_VERSION;
  /** Preserve suspension and counters; reject stale revisions and unsupported semantics. */
  applyUsageLimit(input: ApplyUsageLimitRequest): Promise<AdapterResult<AppliedUsageLimitState>>;
  /** Read actual provider state, not an echo of the requested revision. */
  getUsageLimitState(input: AppliedUsageLimitState): Promise<AdapterResult<AppliedUsageLimitState>>;
}
export class IncompatibleUsageLimitAdapter extends Error {
  readonly code = "usage_limit_contract_incompatible";
  constructor() { super("Exact usage limits require usage limit adapter extension version 1"); }
}
export function assertProductUsageLimitAdapterV1(value: unknown): asserts value is ProductUsageLimitAdapterV1 {
  try { assertProductAdapterV2(value); } catch { throw new IncompatibleUsageLimitAdapter(); }
  const adapter = value as unknown as Record<string, unknown>;
  if (adapter.usageLimitContractVersion !== 1 || typeof adapter.applyUsageLimit !== "function" || typeof adapter.getUsageLimitState !== "function") {
    throw new IncompatibleUsageLimitAdapter();
  }
}
/** Match every field after validation. This does not authorize activation or prove live enforcement. */
export function matchesAppliedUsageLimit(expected: unknown, observed: unknown): boolean {
  const request = AppliedUsageLimitStateSchema.safeParse(expected);
  const receipt = AppliedUsageLimitStateSchema.safeParse(observed);
  if (!request.success || !receipt.success) return false;
  const a = request.data, b = receipt.data;
  return Object.keys(a.limit).every(key => a.limit[key as keyof typeof a.limit] === b.limit[key as keyof typeof b.limit])
    && a.target.externalOrganizationId === b.target.externalOrganizationId
    && a.target.externalMemberId === b.target.externalMemberId
    && a.scope === b.scope;
}
