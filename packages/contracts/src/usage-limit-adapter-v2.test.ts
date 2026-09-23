import { describe, expect, it, vi } from "vitest";
import { createCanonicalId } from "./ids.js";
import { PRODUCT_ADAPTER_METHODS } from "./product-adapter.js";
import { AppliedUsageLimitStateV2Schema, ApplyUsageLimitRequestV2Schema,
  UsageLimitAdapterResultV2Schema, assertProductUsageLimitAdapterV2, matchesAppliedUsageLimitV2 } from "./usage-limit-adapter-v2.js";
import { UsageLimitRevisionV2Schema } from "./usage-limits-v2.js";

const state = () => ({ schemaVersion: 2, limit: {
  schemaVersion: 2, usageLimitId: createCanonicalId("usageLimit"), organizationId: createCanonicalId("organization"),
  productInstanceId: createCanonicalId("productInstance"), membershipId: null as string | null,
  meterKey: "enriched-leads", meterVersion: 3, unit: "lead", window: "utc_month",
  revision: 7, maximumQuantity: "10.5",
}, target: { externalOrganizationId: "scalar-org", externalMemberId: null as string | null },
  enforcement: "hard_stop", accounting: "preserve_accumulated_usage", scope: "organization_aggregate" });

describe("meter-version-bound exact usage limits", () => {
  it("requires a positive meter version and rejects V1-shaped or unlimited policy", () => {
    const value = state();
    expect(UsageLimitRevisionV2Schema.parse(value.limit).meterVersion).toBe(3);
    for (const meterVersion of [undefined, 0, -1, 1.5, 2147483648, "3"]) {
      expect(UsageLimitRevisionV2Schema.safeParse({ ...value.limit, meterVersion }).success).toBe(false);
    }
    for (const patch of [{ schemaVersion: 1 }, { maximumQuantity: "unlimited" }, { maximumQuantity: Infinity }, { revision: 0 }]) {
      expect(UsageLimitRevisionV2Schema.safeParse({ ...value.limit, ...patch }).success).toBe(false);
    }
    expect(AppliedUsageLimitStateV2Schema.safeParse({ ...value, limit: { ...value.limit, meterVersion: undefined } }).success).toBe(false);
  });

  it("binds member and aggregate scopes and preserves hard stop and counters", () => {
    const aggregate = state();
    expect(AppliedUsageLimitStateV2Schema.safeParse(aggregate).success).toBe(true);
    const member = { ...aggregate, scope: "member", limit: { ...aggregate.limit, membershipId: createCanonicalId("membership") },
      target: { ...aggregate.target, externalMemberId: "scalar-member" } };
    expect(AppliedUsageLimitStateV2Schema.safeParse(member).success).toBe(true);
    for (const invalid of [
      { ...member, target: aggregate.target },
      { ...aggregate, scope: "member" },
      { ...aggregate, target: member.target },
      { ...member, enforcement: "soft_stop" },
      { ...member, accounting: "reset_accumulated_usage" },
      { ...member, access: "active" },
    ]) expect(AppliedUsageLimitStateV2Schema.safeParse(invalid).success).toBe(false);
    expect(ApplyUsageLimitRequestV2Schema.safeParse({ ...member, idempotencyKey: "apply-1" }).success).toBe(true);
    expect(ApplyUsageLimitRequestV2Schema.safeParse({ ...member, idempotencyKey: "" }).success).toBe(false);
  });

  it("rejects stale meter versions, revisions, quantities, identities and weaker receipts", () => {
    const expected = state();
    expect(matchesAppliedUsageLimitV2(expected, structuredClone(expected))).toBe(true);
    for (const patch of [
      { meterVersion: 2 }, { revision: 6 }, { maximumQuantity: "11" }, { meterKey: "email-sends" },
      { unit: "credit" }, { window: "utc_day" }, { usageLimitId: createCanonicalId("usageLimit") },
      { organizationId: createCanonicalId("organization") }, { productInstanceId: createCanonicalId("productInstance") },
    ]) expect(matchesAppliedUsageLimitV2(expected, { ...expected, limit: { ...expected.limit, ...patch } })).toBe(false);
    expect(matchesAppliedUsageLimitV2(expected, { ...expected, target: { ...expected.target, externalOrganizationId: "other" } })).toBe(false);
    const member = { ...expected, scope: "member", limit: { ...expected.limit, membershipId: createCanonicalId("membership") },
      target: { ...expected.target, externalMemberId: "scalar-member" } };
    expect(matchesAppliedUsageLimitV2(member, { ...member, limit: { ...member.limit, membershipId: createCanonicalId("membership") } })).toBe(false);
    expect(matchesAppliedUsageLimitV2(member, { ...member, target: { ...member.target, externalMemberId: "other-member" } })).toBe(false);
    expect(matchesAppliedUsageLimitV2(expected, { ...expected, enforcement: "warning" })).toBe(false);
    expect(matchesAppliedUsageLimitV2(expected, { ...expected, accounting: "reset_usage" })).toBe(false);
    expect(matchesAppliedUsageLimitV2(expected, { ...expected, schemaVersion: 1 })).toBe(false);
    expect(matchesAppliedUsageLimitV2(expected, { ...expected, limit: { ...expected.limit, schemaVersion: 1 } })).toBe(false);
    expect(matchesAppliedUsageLimitV2(expected, { ...expected, limit: { ...expected.limit, maximumQuantity: "10.500000" } })).toBe(true);
  });

  it("accepts only V2 receipts and a complete explicit V2 adapter", () => {
    const value = state(), call = vi.fn();
    expect(UsageLimitAdapterResultV2Schema.safeParse({ status: "succeeded", value }).success).toBe(true);
    expect(UsageLimitAdapterResultV2Schema.safeParse({ status: "succeeded", value: { ...value, schemaVersion: 1 } }).success).toBe(false);
    expect(UsageLimitAdapterResultV2Schema.safeParse({ status: "succeeded", value: { ...value, limit: { ...value.limit, meterVersion: undefined } } }).success).toBe(false);
    for (const invalid of [
      { status: "pending", operationId: "" },
      { status: "retryable_failure", code: "bad code" },
      { status: "retryable_failure", code: "temporary", retryAfterSeconds: 0 },
      { status: "permanent_failure", code: "invalid", extra: true },
      { status: "succeeded", value, extra: true },
    ]) expect(UsageLimitAdapterResultV2Schema.safeParse(invalid).success).toBe(false);
    const old = { contractVersion: 2, ...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(method => [method, call])),
      usageLimitContractVersion: 1, applyUsageLimit: call, getUsageLimitState: call };
    expect(() => assertProductUsageLimitAdapterV2(old)).toThrow();
    const next = { ...old, usageLimitV2ContractVersion: 2, applyUsageLimitV2: call, getUsageLimitStateV2: call };
    expect(() => assertProductUsageLimitAdapterV2(next)).not.toThrow();
    for (const patch of [{ usageLimitV2ContractVersion: 1 }, { applyUsageLimitV2: undefined },
      { getUsageLimitStateV2: undefined }, { getUsageLimitState: undefined }, { contractVersion: 1 }]) {
      expect(() => assertProductUsageLimitAdapterV2({ ...next, ...patch })).toThrow();
    }
    expect(call).not.toHaveBeenCalled();
  });
});
