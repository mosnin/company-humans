import { describe, expect, it } from "vitest";
import { createCanonicalId } from "./ids.js";
import {
  BudgetOperationV1Schema, BudgetPolicyV1Schema, resolveBudgetPoliciesV1,
} from "./budget-policy.js";

const organizationId = createCanonicalId("organization");
const productId = createCanonicalId("product");
const productInstanceId = createCanonicalId("productInstance");
const membershipId = createCanonicalId("membership");
const teamA = createCanonicalId("team");
const teamB = createCanonicalId("team");
const unrelatedTeam = createCanonicalId("team");
const meter = { meterKey: "enriched-leads", meterVersion: 2, unit: "lead" };
const operation = {
  schemaVersion: 1, organizationId, productId, productInstanceId, membershipId,
  operationTeam: { teamId: teamA, organizationId, membershipId },
  capabilityKey: "outbound-enrichment", meter,
} as const;

function policy(scope: object, maximumQuantity: string, action = "hard_stop", window = "utc_month") {
  return {
    schemaVersion: 1, policyId: createCanonicalId("budget"), revision: 1,
    organizationId, productId, meter, window, maximumQuantity, action, scope,
  };
}

describe("exact meter quantity budget policy", () => {
  it("validates typed identities, meter binding, finite precision, scope and revision", () => {
    const original = policy({ kind: "team", teamId: teamA }, "0.000001");
    expect(BudgetPolicyV1Schema.parse(original).maximumQuantity).toBe("0.000001");
    expect(BudgetPolicyV1Schema.parse({ ...original, maximumQuantity: "0.000000" }).maximumQuantity).toBe("0");
    for (const change of [
      { organizationId: membershipId }, { productId: organizationId }, { policyId: teamA },
      { revision: 0 }, { revision: 1.2 }, { meter: { ...meter, meterVersion: 0 } },
      { meter: { ...meter, unit: "" } }, { window: "rolling_week" },
      { maximumQuantity: "0.0000001" }, { maximumQuantity: "unlimited" },
      { maximumQuantity: 12 }, { scope: { kind: "team", teamId: organizationId } },
    ]) expect(BudgetPolicyV1Schema.safeParse({ ...original, ...change }).success).toBe(false);
    expect(BudgetOperationV1Schema.safeParse({ ...operation, productInstanceId: teamA }).success).toBe(false);
  });

  it("keeps all applicable constraints and resolves each window by exact quantity", () => {
    const org = policy({ kind: "organization" }, "10", "hard_stop");
    const product = policy({ kind: "product", productId }, "50", "warning");
    const firstTeam = policy({ kind: "team", teamId: teamA }, "9.000001", "soft_pause");
    const secondTeam = policy({ kind: "team", teamId: teamB }, "9.000000", "manager_approval");
    const unrelated = policy({ kind: "team", teamId: unrelatedTeam }, "1", "emergency_shutdown");
    const member = policy({ kind: "member", membershipId }, "8.999999", "warning");
    const daily = policy({ kind: "meter" }, "0.000001", "informational", "utc_day");
    const result = resolveBudgetPoliciesV1(operation, [unrelated, daily, secondTeam, product, org, firstTeam, member]);
    expect(result.constraints).toHaveLength(5);
    expect(result.constraints.map(item => item.policyId)).not.toContain(unrelated.policyId);
    expect(result.constraints.map(item => item.policyId)).not.toContain(secondTeam.policyId);
    expect(result.windows).toEqual([
      { window: "utc_day", earliestThresholdQuantity: "0.000001", bindingPolicyIds: [daily.policyId] },
      { window: "utc_month", earliestThresholdQuantity: "8.999999", bindingPolicyIds: [member.policyId] },
    ]);
    expect(result.constraints.find(item => item.policyId === org.policyId)?.revision).toBe(1);
    expect(result.constraints.find(item => item.policyId === firstTeam.policyId)?.scope).toEqual({ kind: "team", teamId: teamA });
    expect(resolveBudgetPoliciesV1(operation, [member, firstTeam, org, product, secondTeam, daily, unrelated])).toEqual(result);
  });

  it("preserves ties, parent stricter than child, and zero", () => {
    const org = policy({ kind: "organization" }, "0.000000", "hard_stop");
    const child = policy({ kind: "team", teamId: teamA }, "20", "emergency_shutdown");
    const tie = policy({ kind: "member", membershipId }, "0", "warning");
    const result = resolveBudgetPoliciesV1(operation, [child, tie, org]);
    expect(result.windows).toEqual([{
      window: "utc_month", earliestThresholdQuantity: "0", bindingPolicyIds: [org.policyId, tie.policyId],
    }]);
    expect(result.constraints).toHaveLength(3);
  });

  it("does not merge a later hard stop into an earlier warning threshold", () => {
    const warning = policy({ kind: "organization" }, "5", "warning");
    const hardStop = policy({ kind: "product", productId }, "10", "hard_stop");
    const result = resolveBudgetPoliciesV1(operation, [hardStop, warning]);
    expect(result.windows).toEqual([{ window: "utc_month", earliestThresholdQuantity: "5", bindingPolicyIds: [warning.policyId] }]);
    expect(result.constraints.map(item => [item.maximumQuantity, item.action])).toEqual([["5", "warning"], ["10", "hard_stop"]]);
    expect(result.windows[0]).not.toHaveProperty("action");
  });

  it("charges only the operation team even when a member belongs to another team", () => {
    const limitA = policy({ kind: "team", teamId: teamA }, "10");
    const limitB = policy({ kind: "team", teamId: teamB }, "0");
    const forA = resolveBudgetPoliciesV1(operation, [limitA, limitB]);
    expect(forA.windows[0]?.earliestThresholdQuantity).toBe("10");
    expect(forA.constraints.map(item => item.policyId)).toEqual([limitA.policyId]);
    const forB = resolveBudgetPoliciesV1({ ...operation, operationTeam: { ...operation.operationTeam, teamId: teamB } }, [limitA, limitB]);
    expect(forB.windows[0]?.earliestThresholdQuantity).toBe("0");
    expect(forB.constraints.map(item => item.policyId)).toEqual([limitB.policyId]);
  });

  it("keeps product and product-instance scopes distinct", () => {
    const product = policy({ kind: "product", productId }, "10");
    const instance = policy({ kind: "product_instance", productInstanceId }, "5");
    const otherInstance = policy({ kind: "product_instance", productInstanceId: createCanonicalId("productInstance") }, "1");
    const result = resolveBudgetPoliciesV1(operation, [otherInstance, instance, product]);
    expect(result.constraints.map(item => item.policyId)).toEqual([product.policyId, instance.policyId]);
    expect(result.windows[0]?.earliestThresholdQuantity).toBe("5");
    expect(BudgetPolicyV1Schema.safeParse({ ...product, scope: { kind: "product", productInstanceId } }).success).toBe(false);
  });

  it("keeps capability and meter as independent policy dimensions", () => {
    const capability = policy({ kind: "capability", capabilityKey: "outbound-enrichment" }, "4");
    const otherCapability = policy({ kind: "capability", capabilityKey: "image-generation" }, "1");
    const metered = policy({ kind: "meter" }, "5");
    const result = resolveBudgetPoliciesV1(operation, [metered, otherCapability, capability]);
    expect(result.constraints.map(item => item.policyId)).toEqual([capability.policyId, metered.policyId]);
    expect(result.windows[0]?.earliestThresholdQuantity).toBe("4");
    expect(BudgetPolicyV1Schema.safeParse({ ...capability, scope: { kind: "capability", meterKey: meter.meterKey } }).success).toBe(false);
  });

  it("rejects foreign tenant, product, meter, version and unit candidates", () => {
    const original = policy({ kind: "organization" }, "10");
    for (const change of [
      { organizationId: createCanonicalId("organization") },
      { productId: createCanonicalId("product") },
      { meter: { ...meter, meterKey: "email-sends" } },
      { meter: { ...meter, meterVersion: 3 } },
      { meter: { ...meter, unit: "email" } },
    ]) expect(() => resolveBudgetPoliciesV1(operation, [original, { ...original, policyId: createCanonicalId("budget"), ...change }])).toThrow();
    expect(() => resolveBudgetPoliciesV1(operation, [original, original])).toThrow(/Duplicate/);
  });

  it("fails closed on missing, foreign or mismatched team attribution", () => {
    const teamPolicy = policy({ kind: "team", teamId: teamA }, "2");
    expect(() => resolveBudgetPoliciesV1({ ...operation, operationTeam: null }, [teamPolicy])).toThrow(/team attribution/);
    expect(() => resolveBudgetPoliciesV1({ ...operation, operationTeam: { ...operation.operationTeam, organizationId: createCanonicalId("organization") } }, [teamPolicy])).toThrow(/boundary/);
    expect(() => resolveBudgetPoliciesV1({ ...operation, operationTeam: { ...operation.operationTeam, membershipId: createCanonicalId("membership") } }, [teamPolicy])).toThrow(/boundary/);
    expect(() => resolveBudgetPoliciesV1({ ...operation, operationTeam: { ...operation.operationTeam, source: "client_claimed_team" } }, [teamPolicy])).toThrow();
    expect(() => resolveBudgetPoliciesV1({ ...operation, operationTeam: { ...operation.operationTeam, organizationId: createCanonicalId("organization") } }, [policy({ kind: "organization" }, "2")])).toThrow(/boundary/);
    expect(() => resolveBudgetPoliciesV1({ ...operation, membershipId: null, operationTeam: null }, [policy({ kind: "member", membershipId }, "2")])).toThrow(/member attribution/);
    expect(() => resolveBudgetPoliciesV1({ ...operation, capabilityKey: null }, [policy({ kind: "capability", capabilityKey: "outbound-enrichment" }, "2")])).toThrow(/capability attribution/);
  });
});
