import { describe, expect, it, vi } from "vitest";
import { createCanonicalId } from "./ids.js";
import { PRODUCT_ADAPTER_METHODS } from "./product-adapter.js";
import { assertProductAdapterV2 } from "./product-adapter-v2.js";
import { AppliedUsageLimitStateSchema, ApplyUsageLimitRequestSchema, UsageLimitAdapterResultSchema, assertProductUsageLimitAdapterV1, matchesAppliedUsageLimit } from "./usage-limit-adapter.js";
const state = () => ({ schemaVersion: 1, limit: {
  schemaVersion: 1, usageLimitId: createCanonicalId("usageLimit"), organizationId: createCanonicalId("organization"),
  productInstanceId: createCanonicalId("productInstance"), membershipId: null as string | null,
  meterKey: "enriched-leads", unit: "lead", window: "utc_month", revision: 1, maximumQuantity: "999999999999.999999",
}, target: { externalOrganizationId: "scalar-org", externalMemberId: null as string | null }, enforcement: "hard_stop", accounting: "preserve_accumulated_usage", scope: "organization_aggregate" });

describe("exact usage limit adapter extension", () => {
  it("preserves V2 compatibility but rejects legacy limit handling without calling a provider", () => {
    const call = vi.fn();
    const old = { contractVersion: 2, ...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(method => [method, call])) };
    expect(() => assertProductAdapterV2(old)).not.toThrow();
    expect(() => assertProductUsageLimitAdapterV1(old)).toThrow();
    const adapter = { ...old, usageLimitContractVersion: 1, applyUsageLimit: call, getUsageLimitState: call };
    expect(() => assertProductUsageLimitAdapterV1(adapter)).not.toThrow();
    for (const patch of [{ contractVersion: 1 }, { usageLimitContractVersion: 2 }, { applyUsageLimit: undefined }, { getUsageLimitState: undefined }, { suspendMember: undefined }]) {
      expect(() => assertProductUsageLimitAdapterV1({ ...adapter, ...patch })).toThrow();
    }
    expect(call).not.toHaveBeenCalled();
  });
  it("preserves exact quantities, including zero, and requires idempotency", () => {
    const value = state();
    expect(AppliedUsageLimitStateSchema.parse(value).limit.maximumQuantity).toBe("999999999999.999999");
    for (const maximumQuantity of ["0", "1.250000"]) {
      const parsed = ApplyUsageLimitRequestSchema.parse({ ...value, limit: { ...value.limit, maximumQuantity }, idempotencyKey: "command-1" });
      expect(parsed.limit.maximumQuantity).toBe(maximumQuantity === "0" ? "0" : "1.25");
    }
    for (const idempotencyKey of [undefined, "", "x".repeat(513)]) expect(ApplyUsageLimitRequestSchema.safeParse({ ...value, idempotencyKey }).success).toBe(false);
    for (const maximumQuantity of [1, -1, Infinity, "unlimited", "0.0000001"]) expect(AppliedUsageLimitStateSchema.safeParse({ ...value, limit: { ...value.limit, maximumQuantity } }).success).toBe(false);
  });
  it("requires aggregate organization scope and bound identity for member scope", () => {
    const value = state();
    expect(AppliedUsageLimitStateSchema.safeParse(value).success).toBe(true);
    expect(AppliedUsageLimitStateSchema.safeParse({ ...value, scope: "member" }).success).toBe(false);
    expect(AppliedUsageLimitStateSchema.safeParse({ ...value, target: { ...value.target, externalMemberId: "remote" } }).success).toBe(false);
    const member = { ...value, scope: "member", limit: { ...value.limit, membershipId: createCanonicalId("membership") }, target: { ...value.target, externalMemberId: "remote" } };
    expect(AppliedUsageLimitStateSchema.safeParse(member).success).toBe(true);
    expect(AppliedUsageLimitStateSchema.safeParse({ ...member, scope: "organization_aggregate" }).success).toBe(false);
    expect(AppliedUsageLimitStateSchema.safeParse({ ...member, target: value.target }).success).toBe(false);
  });
  it("rejects acknowledgements that weaken enforcement, reset counters or add grant state", () => {
    const value = state();
    for (const patch of [{ enforcement: "warning" }, { accounting: "reset_usage" }, { accounting: undefined }, { status: "active" }, { credentials: "secret" }, { schemaVersion: 2 }]) {
      expect(AppliedUsageLimitStateSchema.safeParse({ ...value, ...patch }).success).toBe(false);
    }
    expect(UsageLimitAdapterResultSchema.safeParse({ status: "succeeded", value }).success).toBe(true);
    expect(UsageLimitAdapterResultSchema.safeParse({ status: "succeeded", value, providerToken: "secret" }).success).toBe(false);
  });
  it("rejects stale, foreign or reinterpreted readback for every persisted limit field", () => {
    const value = state();
    expect(matchesAppliedUsageLimit(value, structuredClone(value))).toBe(true);
    for (const patch of [{ usageLimitId: createCanonicalId("usageLimit") }, { organizationId: createCanonicalId("organization") }, { productInstanceId: createCanonicalId("productInstance") }, { membershipId: createCanonicalId("membership") }, { meterKey: "email-sends" }, { unit: "credit" }, { window: "utc_day" }, { revision: 2 }, { maximumQuantity: "100" }, { schemaVersion: 2 }]) {
      expect(matchesAppliedUsageLimit(value, { ...value, limit: { ...value.limit, ...patch } })).toBe(false);
    }
    expect(matchesAppliedUsageLimit(value, { ...value, target: { ...value.target, externalOrganizationId: "foreign" } })).toBe(false);
    const member = { ...value, scope: "member", limit: { ...value.limit, membershipId: createCanonicalId("membership") }, target: { ...value.target, externalMemberId: "one" } };
    expect(matchesAppliedUsageLimit(member, { ...member, target: { ...member.target, externalMemberId: "two" } })).toBe(false);
    expect(matchesAppliedUsageLimit({}, value)).toBe(false);
  });
  it("accepts equivalent decimal normalization without floating point rounding", () => {
    const value = state(), expected = { ...value, limit: { ...value.limit, maximumQuantity: "1.25" } };
    expect(matchesAppliedUsageLimit(expected, { ...value, limit: { ...value.limit, maximumQuantity: "1.250000" } })).toBe(true);
    expect(matchesAppliedUsageLimit(expected, { ...value, limit: { ...value.limit, maximumQuantity: "1.250001" } })).toBe(false);
  });
  it("keeps pending and bounded failures distinct from applied readback", () => {
    for (const result of [{ status: "pending", operationId: "operation" }, { status: "retryable_failure", code: "provider_unavailable", retryAfterSeconds: 60 }, { status: "permanent_failure", code: "unsupported_window" }]) expect(UsageLimitAdapterResultSchema.safeParse(result).success).toBe(true);
    for (const result of [{ status: "pending", operationId: "" }, { status: "retryable_failure", code: "retry", retryAfterSeconds: 0 }, { status: "retryable_failure", code: "retry", retryAfterSeconds: Infinity }, { status: "permanent_failure", code: "secret token" }]) expect(UsageLimitAdapterResultSchema.safeParse(result).success).toBe(false);
  });
});
