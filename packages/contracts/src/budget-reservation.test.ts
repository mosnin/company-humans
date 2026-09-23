import { describe, expect, it } from "vitest";
import { evaluateBudgetConsumptionV1 } from "./budget-evaluation.js";
import {
  BudgetReservationDiagnosticV1Schema, BudgetReservationIntentV1Schema,
  BudgetReservationRequestV1Schema, BudgetReservationTransitionV1Schema,
  budgetReservationRequestFingerprintV1, classifyBudgetReservationRetryV1,
  projectBudgetReservationV1, BudgetReservationUsageEvidenceV1Schema,
  BudgetReservationLateReconciliationV1Schema, validateBudgetReservationUsageEvidenceV1,
  validateBudgetReservationLateReconciliationV1, validateBudgetReservationTransitionV1,
} from "./budget-reservation.js";
import { BudgetReservationIdSchema, CanonicalIdReferenceV1Schema, createCanonicalId } from "./ids.js";

const organizationId = createCanonicalId("organization");
const productId = createCanonicalId("product");
const productInstanceId = createCanonicalId("productInstance");
const membershipId = createCanonicalId("membership");
const teamId = createCanonicalId("team");
const meter = { meterKey: "enriched-leads", meterVersion: 2, unit: "lead" } as const;
const evaluatedAt = "2026-09-23T12:00:00Z";
const operation = {
  schemaVersion: 1, organizationId, productId, productInstanceId, membershipId,
  operationTeam: { teamId, organizationId, membershipId },
  capabilityKey: "outbound-enrichment", meter,
} as const;
const request = {
  schemaVersion: 1, operation, environment: "production", aggregation: "sum",
  source: { system: "scalar", operationId: "enrich-123" },
  requestedQuantity: "1", idempotencyKey: "enrichment:operation-123",
} as const;

function policy(action: "warning" | "hard_stop", maximumQuantity: string) {
  return {
    schemaVersion: 1, policyId: createCanonicalId("budget"), revision: 3,
    organizationId, productId, meter, window: "utc_day", maximumQuantity,
    action, scope: { kind: "organization" },
  } as const;
}

function evaluation() {
  const policies = [policy("warning", "5"), policy("hard_stop", "10")];
  return evaluateBudgetConsumptionV1(operation, policies, [{
    schemaVersion: 1, organizationId, productId, meter, window: "utc_day",
    scope: { kind: "organization" }, quantity: "6", environment: "production",
    evaluatedAt, from: "2026-09-23T00:00:00Z", until: "2026-09-24T00:00:00Z", aggregation: "sum",
  }], { environment: "production", aggregation: "sum", evaluatedAt });
}

function outstanding() {
  return [{
    schemaVersion: 1, organizationId, productId, meter, environment: "production",
    aggregation: "sum", evaluatedAt, window: "utc_day", scope: { kind: "organization" },
    from: "2026-09-23T00:00:00Z", until: "2026-09-24T00:00:00Z",
    outstandingQuantity: "3.000001",
  }];
}

function intent() {
  return {
    schemaVersion: 1, reservationId: createCanonicalId("budgetReservation"),
    request, requestFingerprint: budgetReservationRequestFingerprintV1(request),
    projection: projectBudgetReservationV1(request, evaluation(), outstanding()), initialState: "requested",
    recordedAt: "2026-09-23T12:00:01Z", expiresAt: "2026-09-23T12:05:00Z",
    clockSource: "database_transaction",
    provenance: {
      auditId: createCanonicalId("audit"), actor: { type: "service", id: "budget-engine" },
      requestId: "request-123",
    },
  } as const;
}

describe("versioned pre-cost reservation contract", () => {
  it("creates a typed ch_res identity and rejects other or malformed IDs", () => {
    const reservationId = createCanonicalId("budgetReservation");
    expect(BudgetReservationIdSchema.parse(reservationId)).toBe(reservationId);
    expect(CanonicalIdReferenceV1Schema.parse({ schemaVersion: 1, kind: "budgetReservation", id: reservationId }).id)
      .toBe(reservationId);
    for (const invalid of [createCanonicalId("budget"), "ch_res_abc", "ch_res_" + "A".repeat(32), "res_" + "0".repeat(32)]) {
      expect(BudgetReservationIdSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("requires exact positive finite quantity, a bounded key, and declared sum semantics", () => {
    expect(BudgetReservationRequestV1Schema.parse({ ...request, requestedQuantity: "1.000000" }).requestedQuantity)
      .toBe("1");
    expect(BudgetReservationRequestV1Schema.parse({ ...request, requestedQuantity: "0.000001" }).requestedQuantity)
      .toBe("0.000001");
    for (const quantity of ["0", "0.000000", "unlimited", "Infinity", "0.0000001", 1.2, NaN, "-1", "1e2", "1.2345678"]) {
      expect(BudgetReservationRequestV1Schema.safeParse({ ...request, requestedQuantity: quantity }).success).toBe(false);
    }
    for (const aggregation of ["maximum", "last", "average", null]) {
      expect(BudgetReservationRequestV1Schema.safeParse({ ...request, aggregation }).success).toBe(false);
    }
    for (const idempotencyKey of ["", " ", "bad key", "x".repeat(257)]) {
      expect(BudgetReservationRequestV1Schema.safeParse({ ...request, idempotencyKey }).success).toBe(false);
    }
    expect(BudgetReservationRequestV1Schema.safeParse({ ...request, unlimited: true }).success).toBe(false);
  });

  it("compares a full canonical request for retries under one tenant, product, and key", () => {
    const equivalent = { ...request, requestedQuantity: "1.000000" };
    expect(budgetReservationRequestFingerprintV1(equivalent)).toBe(budgetReservationRequestFingerprintV1(request));
    expect(classifyBudgetReservationRetryV1(request, equivalent)).toBe("replay");
    expect(classifyBudgetReservationRetryV1(request, { ...request, idempotencyKey: "another" })).toBe("replay");
    expect(classifyBudgetReservationRetryV1(request, { ...request, environment: "test" })).toBe("new");
    expect(classifyBudgetReservationRetryV1(request, {
      ...request, operation: { ...operation, organizationId: createCanonicalId("organization") },
    })).toBe("new");
    for (const change of [
      { requestedQuantity: "2" },
      { operation: { ...operation, capabilityKey: "another-capability" } },
      { operation: { ...operation, operationTeam: null } },
    ]) {
      expect(() => classifyBudgetReservationRetryV1(request, { ...request, ...change }))
        .toThrow(/idempotency conflict/);
    }
  });

  it("preserves exact policy actions and rejects missing coverage, a mismatched environment, or a false fingerprint", () => {
    const original = intent();
    const parsed = BudgetReservationIntentV1Schema.parse(original);
    expect(parsed.initialState).toBe("requested");
    expect(parsed.projection.constraints.map(constraint => [constraint.action, constraint.projectedResult]))
      .toEqual(expect.arrayContaining([["warning", "exceeded"], ["hard_stop", "exceeded"]]));
    expect(BudgetReservationIntentV1Schema.safeParse({ ...original, requestFingerprint: "changed" }).success).toBe(false);
    expect(BudgetReservationIntentV1Schema.safeParse({ ...original, projection: { ...original.projection, constraints: [] } }).success).toBe(false);
    expect(BudgetReservationIntentV1Schema.safeParse({ ...original, request: { ...request, environment: "test" },
      requestFingerprint: budgetReservationRequestFingerprintV1({ ...request, environment: "test" }) }).success).toBe(false);
    expect(BudgetReservationIntentV1Schema.safeParse({ ...original, projection: { ...original.projection,
      constraints: [{ ...original.projection.constraints[0], action: "unknown" }] } }).success).toBe(false);
    expect(BudgetReservationIntentV1Schema.safeParse({ ...original, recordedAt: "2026-09-23T11:59:59Z" }).success).toBe(false);
    expect(BudgetReservationIntentV1Schema.safeParse({ ...original, expiresAt: original.recordedAt }).success).toBe(false);
    expect(BudgetReservationIntentV1Schema.safeParse({ ...original, clockSource: "client" }).success).toBe(false);
    expect(BudgetReservationIntentV1Schema.safeParse({ ...original, projection: {
      ...original.projection,
      constraints: original.projection.constraints.map((constraint, index) => index === 0
        ? { ...constraint, projectedQuantity: "0" } : constraint),
    } }).success).toBe(false);
  });

  it("allows only append-only lifecycle edges with audit provenance and a usage event on settlement", () => {
    const original = intent();
    const transition = {
      schemaVersion: 1, reservationId: original.reservationId, sequence: 1,
      edge: { from: "requested", to: "reserved" }, occurredAt: "2026-09-23T12:00:02Z",
      provenance: original.provenance, reason: "atomic capacity reservation", usageEvidence: null,
    } as const;
    expect(BudgetReservationTransitionV1Schema.parse(transition).edge.to).toBe("reserved");
    expect(BudgetReservationTransitionV1Schema.safeParse({ ...transition, edge: { from: "requested", to: "settled" } }).success).toBe(false);
    expect(BudgetReservationTransitionV1Schema.safeParse({ ...transition, edge: { from: "settled", to: "reserved" } }).success).toBe(false);
    expect(BudgetReservationTransitionV1Schema.safeParse({ ...transition, sequence: 0 }).success).toBe(false);
    expect(BudgetReservationTransitionV1Schema.safeParse({ ...transition, occurredAt: "2026-09-23T08:00:02-04:00" }).success).toBe(false);
    expect(BudgetReservationTransitionV1Schema.safeParse({ ...transition, usageEvidence: { eventId: createCanonicalId("event") } }).success).toBe(false);
    expect(BudgetReservationTransitionV1Schema.safeParse({ ...transition, edge: { from: "reserved", to: "settled" } }).success).toBe(false);
    expect(validateBudgetReservationTransitionV1(original, transition).edge.to).toBe("reserved");
    expect(() => validateBudgetReservationTransitionV1(original, {
      ...transition, occurredAt: original.expiresAt,
    })).toThrow(/expiry/);
  });

  it("can only emit a non-authorizing diagnostic even if all thresholds are below", () => {
    const original = intent();
    const diagnostic = {
      schemaVersion: 1, reservationId: original.reservationId, projection: original.projection,
      authorizesUsage: false, providerEnforcementConfirmed: false,
    } as const;
    expect(BudgetReservationDiagnosticV1Schema.parse(diagnostic)).toEqual(diagnostic);
    expect(BudgetReservationDiagnosticV1Schema.safeParse({ ...diagnostic, authorizesUsage: true }).success).toBe(false);
    expect(BudgetReservationDiagnosticV1Schema.safeParse({ ...diagnostic, providerEnforcementConfirmed: true }).success).toBe(false);
    expect(BudgetReservationDiagnosticV1Schema.safeParse({ ...diagnostic, allowed: true }).success).toBe(false);
  });

  it("binds retries to source operation identity independently of the transport key", () => {
    expect(BudgetReservationRequestV1Schema.safeParse({ ...request, source: undefined }).success).toBe(false);
    expect(classifyBudgetReservationRetryV1(request, { ...request, idempotencyKey: "a-new-transport-key" })).toBe("replay");
    expect(() => classifyBudgetReservationRetryV1(request, { ...request, idempotencyKey: "a-new-transport-key",
      requestedQuantity: "2" })).toThrow(/idempotency conflict/);
    expect(() => classifyBudgetReservationRetryV1(request, { ...request,
      source: { system: "scalar", operationId: "another-operation" } })).toThrow(/idempotency conflict/);
  });

  it("projects accepted usage, outstanding reservations, and requested quantity exactly per policy", () => {
    const snapshot = evaluation();
    const rows = outstanding();
    const projection = projectBudgetReservationV1(request, snapshot, rows);
    expect(projection.constraints.map((item: { action: string; projectedQuantity: string; projectedResult: string }) =>
      [item.action, item.projectedQuantity, item.projectedResult])).toEqual(expect.arrayContaining([
      ["warning", "10.000001", "exceeded"], ["hard_stop", "10.000001", "exceeded"],
    ]));
    expect(projection.constraints[0]).toMatchObject({
      acceptedReleasedQuantity: "6", outstandingQuantity: "3.000001", requestedQuantity: "1",
    });
    expect(projection.authorizesUsage).toBe(false);
    expect(projection.providerEnforcementConfirmed).toBe(false);
    expect(() => projectBudgetReservationV1(request, snapshot, [])).toThrow(/outstanding/i);
    expect(() => projectBudgetReservationV1(request, snapshot, [{ ...rows[0], environment: "test" }]))
      .toThrow(/environment/i);
  });

  it("requires complete outstanding coverage across different scopes and UTC windows", () => {
    const policies = [
      policy("warning", "5"),
      { ...policy("hard_stop", "3"), action: "manager_approval", window: "utc_week",
        scope: { kind: "team", teamId } },
      { ...policy("hard_stop", "4"), action: "soft_pause", window: "utc_month",
        scope: { kind: "member", membershipId } },
    ];
    const periods = [
      { window: "utc_day", scope: { kind: "organization" }, quantity: "1",
        from: "2026-09-23T00:00:00Z", until: "2026-09-24T00:00:00Z" },
      { window: "utc_week", scope: { kind: "team", teamId }, quantity: "2",
        from: "2026-09-21T00:00:00Z", until: "2026-09-28T00:00:00Z" },
      { window: "utc_month", scope: { kind: "member", membershipId }, quantity: "3",
        from: "2026-09-01T00:00:00Z", until: "2026-10-01T00:00:00Z" },
    ] as const;
    const snapshot = evaluateBudgetConsumptionV1(operation, policies, periods.map(period => ({
      schemaVersion: 1, organizationId, productId, meter, environment: "production",
      aggregation: "sum", evaluatedAt, ...period,
    })), { environment: "production", aggregation: "sum", evaluatedAt });
    const rows = periods.map((period, index) => ({
      schemaVersion: 1, organizationId, productId, meter, environment: "production",
      aggregation: "sum", evaluatedAt, window: period.window, scope: period.scope,
      from: period.from, until: period.until, outstandingQuantity: ["0.5", "0.25", "0.1"][index],
    }));
    const projection = projectBudgetReservationV1(request, snapshot, rows);
    expect(projection.constraints.map(constraint => [constraint.action, constraint.projectedQuantity]))
      .toEqual([["warning", "2.5"], ["manager_approval", "3.25"], ["soft_pause", "4.1"]]);
    expect(() => projectBudgetReservationV1(request, snapshot, rows.slice(0, 2))).toThrow(/Missing outstanding/);
    expect(() => projectBudgetReservationV1(request, snapshot, [...rows, rows[0]])).toThrow(/Duplicate outstanding/);
    expect(() => projectBudgetReservationV1(request, snapshot, [{ ...rows[0], outstandingQuantity: "0" }, ...rows.slice(1)]))
      .not.toThrow();
  });

  it("requires source-bound actual usage evidence and appends late reconciliation after capacity release", () => {
    const original = intent();
    const evidence = {
      schemaVersion: 1, eventId: createCanonicalId("event"),
      organizationId, productId, productInstanceId, membershipId, teamId,
      capabilityKey: operation.capabilityKey, meter, environment: "production",
      source: request.source, sourceEventId: "provider-event-77",
      actualQuantity: "1.5", ingestionDisposition: "accepted",
      occurredAt: "2026-09-23T12:03:00Z", reportedAt: "2026-09-23T12:05:00Z",
    } as const;
    expect(BudgetReservationUsageEvidenceV1Schema.parse(evidence).actualQuantity).toBe("1.5");
    expect(BudgetReservationUsageEvidenceV1Schema.safeParse({ ...evidence, verified: true }).success).toBe(false);
    expect(validateBudgetReservationUsageEvidenceV1(original, evidence).eventId).toBe(evidence.eventId);
    for (const change of [
      { source: { system: "scalar", operationId: "other" } },
      { productInstanceId: createCanonicalId("productInstance") },
      { teamId: createCanonicalId("team") },
      { environment: "test" },
      { actualQuantity: "0" },
    ]) expect(() => validateBudgetReservationUsageEvidenceV1(original, { ...evidence, ...change })).toThrow();
    const settlement = {
      schemaVersion: 1, reservationId: original.reservationId, sequence: 2,
      edge: { from: "reserved", to: "settled" }, occurredAt: "2026-09-23T12:05:30Z",
      provenance: original.provenance, reason: "accepted actual usage", usageEvidence: evidence,
    } as const;
    expect(validateBudgetReservationTransitionV1(original, settlement).edge.to).toBe("settled");
    expect(() => validateBudgetReservationTransitionV1(original, {
      ...settlement, usageEvidence: { ...evidence, source: { system: "scalar", operationId: "other" } },
    })).toThrow(/source operation/);
    const late = {
      schemaVersion: 1, reservationId: original.reservationId, sequence: 3, afterState: "expired",
      evidence, occurredAt: "2026-09-23T12:06:00Z",
      provenance: original.provenance, reason: "late accepted usage after expiry",
    } as const;
    expect(BudgetReservationLateReconciliationV1Schema.parse(late).afterState).toBe("expired");
    expect(validateBudgetReservationLateReconciliationV1(original, late).reservationId).toBe(original.reservationId);
    expect(BudgetReservationLateReconciliationV1Schema.safeParse({ ...late, afterState: "reserved" }).success).toBe(false);
    expect(() => validateBudgetReservationLateReconciliationV1(original, {
      ...late, occurredAt: "2026-09-23T12:04:59Z",
    })).toThrow(/expiry/);
    expect(validateBudgetReservationLateReconciliationV1(original, {
      ...late, afterState: "released", occurredAt: "2026-09-23T12:05:30Z",
    }).afterState).toBe("released");
  });
});
