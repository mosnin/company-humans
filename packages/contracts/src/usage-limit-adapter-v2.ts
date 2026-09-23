import { z } from "zod";
import { UsageLimitRevisionV2Schema } from "./usage-limits-v2.js";
import { assertProductUsageLimitAdapterV1, type ProductUsageLimitAdapterV1 } from "./usage-limit-adapter.js";
import type { AdapterResult } from "./product-adapter.js";

export const USAGE_LIMIT_ADAPTER_V2_VERSION = 2 as const;
const ExternalId = z.string().min(1).max(512);
const Target = z.object({ externalOrganizationId: ExternalId, externalMemberId: ExternalId.nullable() }).strict();
const State = z.object({
  schemaVersion: z.literal(2),
  limit: UsageLimitRevisionV2Schema,
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
export const AppliedUsageLimitStateV2Schema = State.refine(scopeAgrees, { message: "Limit scope and provider target disagree" });
export const ApplyUsageLimitRequestV2Schema = State.extend({ idempotencyKey: ExternalId })
  .refine(scopeAgrees, { message: "Limit scope and provider target disagree" });
export type AppliedUsageLimitStateV2 = z.infer<typeof AppliedUsageLimitStateV2Schema>;
export type ApplyUsageLimitRequestV2 = z.infer<typeof ApplyUsageLimitRequestV2Schema>;

const Code = z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/);
export const UsageLimitAdapterResultV2Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("succeeded"), value: AppliedUsageLimitStateV2Schema }).strict(),
  z.object({ status: z.literal("pending"), operationId: ExternalId }).strict(),
  z.object({ status: z.literal("retryable_failure"), code: Code, retryAfterSeconds: z.number().int().min(1).max(86400).optional() }).strict(),
  z.object({ status: z.literal("permanent_failure"), code: Code }).strict(),
]);

/** V1 methods remain available for old callers; V2 work must call these V2 methods. */
export interface ProductUsageLimitAdapterV2 extends ProductUsageLimitAdapterV1 {
  readonly usageLimitV2ContractVersion: typeof USAGE_LIMIT_ADAPTER_V2_VERSION;
  applyUsageLimitV2(input: ApplyUsageLimitRequestV2): Promise<AdapterResult<AppliedUsageLimitStateV2>>;
  getUsageLimitStateV2(input: AppliedUsageLimitStateV2): Promise<AdapterResult<AppliedUsageLimitStateV2>>;
}
export class IncompatibleUsageLimitAdapterV2 extends Error {
  readonly code = "usage_limit_v2_contract_incompatible";
  constructor() { super("Meter-version-bound usage limits require usage limit adapter extension version 2"); }
}
/** A V1-only adapter is never upgraded by a cast or fallback. */
export function assertProductUsageLimitAdapterV2(value: unknown): asserts value is ProductUsageLimitAdapterV2 {
  try { assertProductUsageLimitAdapterV1(value); } catch { throw new IncompatibleUsageLimitAdapterV2(); }
  const adapter = value as unknown as Record<string, unknown>;
  if (adapter.usageLimitV2ContractVersion !== 2 || typeof adapter.applyUsageLimitV2 !== "function"
    || typeof adapter.getUsageLimitStateV2 !== "function") throw new IncompatibleUsageLimitAdapterV2();
}

/** Compare complete validated policy and provider state, including meterVersion. */
export function matchesAppliedUsageLimitV2(expected: unknown, observed: unknown): boolean {
  const request = AppliedUsageLimitStateV2Schema.safeParse(expected);
  const receipt = AppliedUsageLimitStateV2Schema.safeParse(observed);
  if (!request.success || !receipt.success) return false;
  const a = request.data, b = receipt.data;
  return Object.keys(a.limit).every(key => a.limit[key as keyof typeof a.limit] === b.limit[key as keyof typeof b.limit])
    && a.target.externalOrganizationId === b.target.externalOrganizationId
    && a.target.externalMemberId === b.target.externalMemberId
    && a.scope === b.scope
    && a.enforcement === b.enforcement && a.accounting === b.accounting;
}
