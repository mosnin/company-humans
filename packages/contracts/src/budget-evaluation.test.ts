import { describe, expect, it } from "vitest";
import { createCanonicalId } from "./ids.js";
import {
  BudgetConsumptionEvaluationV1Schema,
  evaluateBudgetConsumptionV1 as evaluateBudgetConsumptionV1Raw,
} from "./budget-evaluation.js";

const organizationId = createCanonicalId("organization");
const otherOrganizationId = createCanonicalId("organization");
const productId = createCanonicalId("product");
const otherProductId = createCanonicalId("product");
const productInstanceId = createCanonicalId("productInstance");
const membershipId = createCanonicalId("membership");
const teamId = createCanonicalId("team");
const meter = { meterKey: "enriched-leads", meterVersion: 2, unit: "lead" } as const;
const evaluatedAt = "2026-09-23T12:00:00Z";
const evaluationContext = { environment: "production" as const, aggregation: "sum" as const, evaluatedAt };

const operation = {
  schemaVersion: 1,
  organizationId,
  productId,
  productInstanceId,
  membershipId,
  operationTeam: { teamId, organizationId, membershipId },
  capabilityKey: "outbound-enrichment",
  meter,
} as const;

function policy(
  scope: object,
  maximumQuantity: string,
  action: "informational" | "warning" | "manager_approval" | "soft_pause" | "hard_stop" | "emergency_shutdown" = "hard_stop",
  window: "utc_day" | "utc_week" | "utc_month" = "utc_month",
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    policyId: createCanonicalId("budget"),
    revision: 1,
    organizationId,
    productId,
    meter,
    window,
    maximumQuantity,
    action,
    scope,
    ...overrides,
  };
}

function consumption(
  scope: object,
  quantity: string,
  window: "utc_day" | "utc_week" | "utc_month" = "utc_month",
  overrides: Record<string, unknown> = {},
) {
  const period = window === "utc_day"
    ? { from: "2026-09-23T00:00:00Z", until: "2026-09-24T00:00:00Z" }
    : window === "utc_week"
      ? { from: "2026-09-21T00:00:00Z", until: "2026-09-28T00:00:00Z" }
      : { from: "2026-09-01T00:00:00Z", until: "2026-10-01T00:00:00Z" };
  return {
    schemaVersion: 1,
    organizationId,
    productId,
    meter,
    window,
    scope,
    quantity,
    environment: "production" as const,
    evaluatedAt,
    ...period,
    aggregation: "sum" as const,
    ...overrides,
  };
}

function evaluateBudgetConsumptionV1(
  operationInput: unknown,
  policyInputs: readonly unknown[],
  consumptionInputs: readonly unknown[],
  context: Record<string, unknown> = evaluationContext,
) {
  return evaluateBudgetConsumptionV1Raw(operationInput, policyInputs, consumptionInputs, context);
}

describe("pure budget consumption evaluation", () => {
  it("retains an overlap warning and later hard stop as separate threshold results", () => {
    const warning = policy({ kind: "organization" }, "5", "warning");
    const hardStop = policy({ kind: "organization" }, "10", "hard_stop");

    const result = evaluateBudgetConsumptionV1(operation, [hardStop, warning], [
      consumption({ kind: "organization" }, "6.000001"),
    ]);

    expect(result.constraints.find(item => item.policyId === warning.policyId)).toMatchObject({
      maximumQuantity: "5", action: "warning", usageQuantity: "6.000001", result: "exceeded",
    });
    expect(result.constraints.find(item => item.policyId === hardStop.policyId)).toMatchObject({
      maximumQuantity: "10", action: "hard_stop", usageQuantity: "6.000001", result: "below",
    });
    expect(result).not.toHaveProperty("allow");
    expect(result).not.toHaveProperty("deny");
    expect(result).not.toHaveProperty("providerEnforcementConfirmed");
  });

  it("keeps parent, child, and tied thresholds deterministic, including zero", () => {
    const organizationWarning = policy({ kind: "organization" }, "4", "warning");
    const organizationStop = policy({ kind: "organization" }, "4", "hard_stop");
    const team = policy({ kind: "team", teamId }, "10", "soft_pause");
    const zeroMember = policy({ kind: "member", membershipId }, "0", "emergency_shutdown");

    const result = evaluateBudgetConsumptionV1(operation, [team, zeroMember, organizationStop, organizationWarning], [
      consumption({ kind: "organization" }, "5"),
      consumption({ kind: "team", teamId }, "5"),
      consumption({ kind: "member", membershipId }, "0"),
    ]);

    const tied = [organizationWarning, organizationStop].sort((left, right) => left.policyId.localeCompare(right.policyId));
    expect(result.constraints.map(item => [item.scope.kind, item.action, item.result])).toEqual([
      ["organization", tied[0]!.action, "exceeded"],
      ["organization", tied[1]!.action, "exceeded"],
      ["team", "soft_pause", "below"],
      ["member", "emergency_shutdown", "reached"],
    ]);
    expect(result.constraints.slice(0, 2).map(item => item.maximumQuantity)).toEqual(["4", "4"]);
    expect(result.constraints.slice(0, 2).map(item => item.policyId)).toEqual(tied.map(item => item.policyId));
  });

  it("compares six-decimal quantities with BigInt beyond JavaScript safe integers", () => {
    const limit = policy({ kind: "organization" }, "900719925474.000001", "hard_stop");
    const result = evaluateBudgetConsumptionV1(operation, [limit], [
      consumption({ kind: "organization" }, "900719925474.000002"),
    ]);

    expect(result.constraints[0]).toMatchObject({
      maximumQuantity: "900719925474.000001",
      usageQuantity: "900719925474.000002",
      result: "exceeded",
    });
    expect(BudgetConsumptionEvaluationV1Schema.parse(result)).toEqual(result);
  });

  it("requires one complete row per unique applicable scope and window", () => {
    const organization = policy({ kind: "organization" }, "5");
    const team = policy({ kind: "team", teamId }, "8", "warning", "utc_day");
    const rows = [
      consumption({ kind: "organization" }, "1"),
      consumption({ kind: "team", teamId }, "1", "utc_day"),
    ];

    expect(evaluateBudgetConsumptionV1(operation, [organization, team], rows).constraints).toHaveLength(2);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization, team], rows.slice(0, 1)))
      .toThrow(/Missing budget consumption row/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [
      rows[0], rows[0],
    ])).toThrow(/Duplicate budget consumption/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [
      consumption({ kind: "capability", capabilityKey: "outbound-enrichment" }, "1"),
    ])).toThrow(/not an applicable policy scope/);
  });

  it("rejects absent policy coverage and invalid or mixed UTC periods", () => {
    expect(() => evaluateBudgetConsumptionV1(operation, [], [])).toThrow(/No applicable budget policy/);

    const organization = policy({ kind: "organization" }, "5");
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [
      consumption({ kind: "organization" }, "1", "utc_month", {
        from: "2026-09-02T00:00:00Z",
        until: "2026-10-01T00:00:00Z",
      }),
    ])).toThrow(/first day UTC/);

    const week = policy({ kind: "organization" }, "5", "warning", "utc_week");
    expect(() => evaluateBudgetConsumptionV1(operation, [week], [
      consumption({ kind: "organization" }, "1", "utc_week", {
        from: "2026-09-20T00:00:00Z",
        until: "2026-09-27T00:00:00Z",
      }),
    ])).toThrow(/Monday UTC/);

    const product = policy({ kind: "product", productId }, "8", "warning");
    expect(() => evaluateBudgetConsumptionV1(operation, [organization, product], [
      consumption({ kind: "organization" }, "1"),
      consumption({ kind: "product", productId }, "1", "utc_month", {
        from: "2026-08-01T00:00:00Z",
        until: "2026-09-01T00:00:00Z",
      }),
    ])).toThrow(/within its UTC period/);
  });

  it("requires the evaluation instant to be inside each day, week, or month period", () => {
    const day = policy({ kind: "organization" }, "5", "hard_stop", "utc_day");
    expect(evaluateBudgetConsumptionV1(operation, [day], [
      consumption({ kind: "organization" }, "1", "utc_day"),
    ]).constraints[0]?.result).toBe("below");
    expect(() => evaluateBudgetConsumptionV1(operation, [day], [
      consumption({ kind: "organization" }, "1", "utc_day", { evaluatedAt: "2026-09-24T00:00:00Z" }),
    ], { ...evaluationContext, evaluatedAt: "2026-09-24T00:00:00Z" })).toThrow(/within its UTC period/);

    const week = policy({ kind: "organization" }, "5", "hard_stop", "utc_week");
    expect(evaluateBudgetConsumptionV1(operation, [week], [
      consumption({ kind: "organization" }, "1", "utc_week"),
    ]).constraints[0]?.result).toBe("below");

    const month = policy({ kind: "organization" }, "5", "hard_stop", "utc_month");
    expect(evaluateBudgetConsumptionV1(operation, [month], [
      consumption({ kind: "organization" }, "1", "utc_month"),
    ]).constraints[0]?.result).toBe("below");
    expect(() => evaluateBudgetConsumptionV1(operation, [month], [
      consumption({ kind: "organization" }, "1", "utc_month", {
        evaluatedAt: "2026-09-23T12:00:00Z",
        from: "2026-08-01T00:00:00Z",
        until: "2026-09-01T00:00:00Z",
      }),
    ], { ...evaluationContext, evaluatedAt: "2026-09-23T12:00:00Z" })).toThrow(/within its UTC period/);
  });

  it("rejects mixed tenant, product, meter, window, environment, instant, and aggregation identities", () => {
    const organization = policy({ kind: "organization" }, "5");
    const day = policy({ kind: "product", productId }, "8", "warning", "utc_day");
    const baseRows = [
      consumption({ kind: "organization" }, "1"),
      consumption({ kind: "product", productId }, "1", "utc_day"),
    ];

    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [
      consumption({ kind: "organization" }, "1", "utc_month", { organizationId: otherOrganizationId }),
    ])).toThrow(/organization or product boundary/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [
      consumption({ kind: "organization" }, "1", "utc_month", { productId: otherProductId }),
    ])).toThrow(/organization or product boundary/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [
      consumption({ kind: "organization" }, "1", "utc_month", { meter: { ...meter, meterVersion: 3 } }),
    ])).toThrow(/different meter/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [
      consumption({ kind: "organization" }, "1", "utc_day"),
    ])).toThrow(/not an applicable policy scope/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization, day], [
      baseRows[0],
      { ...baseRows[1], environment: "test" },
    ])).toThrow(/one environment/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization, day], [
      { ...baseRows[0], evaluatedAt },
      { ...baseRows[1], evaluatedAt: "2026-09-23T13:00:00Z" },
    ])).toThrow(/one evaluation instant/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization, day], [
      baseRows[0],
      { ...baseRows[1], aggregation: "maximum" },
    ])).toThrow(/one meter aggregation/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [baseRows[0]], {
      ...evaluationContext,
      environment: "test",
    })).toThrow(/evaluation environment/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [baseRows[0]], {
      ...evaluationContext,
      aggregation: "maximum",
    })).toThrow(/registered meter aggregation/);
    expect(() => evaluateBudgetConsumptionV1(operation, [organization], [baseRows[0]], {
      ...evaluationContext,
      evaluatedAt: "2026-09-23T13:00:00Z",
    })).toThrow(/evaluation instant/);
  });

  it("fails closed when a team or capability policy lacks operation attribution", () => {
    const teamPolicy = policy({ kind: "team", teamId }, "5");
    const capabilityPolicy = policy({ kind: "capability", capabilityKey: "outbound-enrichment" }, "5");

    expect(() => evaluateBudgetConsumptionV1(
      { ...operation, operationTeam: null },
      [teamPolicy],
      [],
    )).toThrow(/team attribution/);
    expect(() => evaluateBudgetConsumptionV1(
      { ...operation, capabilityKey: null },
      [capabilityPolicy],
      [],
    )).toThrow(/capability attribution/);
  });

  it("rejects a policy from another tenant before evaluating consumption", () => {
    const foreign = policy({ kind: "organization" }, "5", "hard_stop", "utc_month", {
      organizationId: otherOrganizationId,
    });
    expect(() => evaluateBudgetConsumptionV1(operation, [foreign], [])).toThrow(/crosses organization/);
  });

  it("allows equivalent timestamp offsets while retaining one instant", () => {
    const organization = policy({ kind: "organization" }, "5");
    const result = evaluateBudgetConsumptionV1(operation, [organization], [
      consumption({ kind: "organization" }, "1", "utc_month", { evaluatedAt: "2026-09-23T08:00:00-04:00" }),
    ]);
    expect(result.evaluatedAt).toBe(evaluatedAt);
  });
});
