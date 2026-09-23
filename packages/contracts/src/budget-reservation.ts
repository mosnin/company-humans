import { z } from "zod";
import {
  BudgetConsumptionEvaluationV1Schema, BudgetConsumptionQuantityV1Schema,
  BudgetConsumptionV1Schema, BudgetThresholdResultV1Schema, evaluateBudgetConsumptionV1,
} from "./budget-evaluation.js";
import { BudgetOperationV1Schema } from "./budget-policy.js";
import { ActorV1Schema } from "./envelopes.js";
import {
  AuditIdSchema, BudgetReservationIdSchema, EventIdSchema, MembershipIdSchema,
  OrganizationIdSchema, ProductIdSchema, ProductInstanceIdSchema, TeamIdSchema,
} from "./ids.js";
import { LimitQuantitySchema } from "./usage-limits.js";

const UtcInstantSchema = z.iso.datetime({ offset: true })
  .refine(value => value.endsWith("Z"), "Reservation timestamps must be UTC");
const SourceOperationSchema = z.object({
  system: z.string().regex(/^[a-z][a-z0-9._-]*$/),
  operationId: z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$/u),
}).strict();
const AuditProvenanceSchema = z.object({
  auditId: AuditIdSchema,
  actor: ActorV1Schema,
  requestId: z.string().min(1).max(256),
}).strict();
const PositiveQuantitySchema = LimitQuantitySchema.refine(value => value !== "0", "Quantity must be positive");

/** Pre-cost intent only. The source operation is the durable deduplication key;
 * the caller's idempotency key is an additional transport key. `sum` is merely
 * declared here and still needs a trusted meter registry check.
 */
export const BudgetReservationRequestV1Schema = z.object({
  schemaVersion: z.literal(1),
  operation: BudgetOperationV1Schema,
  source: SourceOperationSchema,
  environment: z.enum(["test", "production"]),
  aggregation: z.literal("sum"),
  requestedQuantity: PositiveQuantitySchema,
  idempotencyKey: z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
}).strict();
export type BudgetReservationRequestV1 = z.infer<typeof BudgetReservationRequestV1Schema>;

/** Exact canonical payload token, not a cryptographic digest. The future DB
 * must independently make (tenant, product, environment, source system,
 * source operation) unique and also make (tenant, product, environment,
 * idempotency key) unique.
 */
export function budgetReservationRequestFingerprintV1(input: unknown): string {
  const request = BudgetReservationRequestV1Schema.parse(input);
  const operation = request.operation;
  return JSON.stringify([
    request.schemaVersion, operation.schemaVersion, operation.organizationId,
    operation.productId, operation.productInstanceId, operation.membershipId,
    operation.operationTeam?.teamId ?? null,
    operation.operationTeam?.organizationId ?? null,
    operation.operationTeam?.membershipId ?? null,
    operation.capabilityKey, operation.meter.meterKey,
    operation.meter.meterVersion, operation.meter.unit,
    request.source.system, request.source.operationId,
    request.environment, request.aggregation, request.requestedQuantity,
  ]);
}

/** A changed transport key cannot reserve the same source operation twice. */
export function classifyBudgetReservationRetryV1(
  existingInput: unknown, incomingInput: unknown,
): "new" | "replay" {
  const existing = BudgetReservationRequestV1Schema.parse(existingInput);
  const incoming = BudgetReservationRequestV1Schema.parse(incomingInput);
  if (existing.operation.organizationId !== incoming.operation.organizationId ||
      existing.operation.productId !== incoming.operation.productId ||
      existing.environment !== incoming.environment) return "new";
  const sameSource = existing.source.system === incoming.source.system &&
    existing.source.operationId === incoming.source.operationId;
  const sameTransportKey = existing.idempotencyKey === incoming.idempotencyKey;
  if (!sameSource && !sameTransportKey) return "new";
  if (!sameSource || budgetReservationRequestFingerprintV1(existing) !== budgetReservationRequestFingerprintV1(incoming)) {
    throw new Error("Budget reservation idempotency conflict: source operation or request changed");
  }
  return "replay";
}

/** Caller-supplied outstanding reservations for exactly one scope/window. A
 * future restricted snapshot reader must derive this under the same tenant,
 * policy revision and transaction snapshot as accepted/released usage. A
 * settled, released or expired reservation is no longer outstanding capacity.
 */
export const BudgetReservationOutstandingV1Schema = BudgetConsumptionV1Schema.omit({ quantity: true }).extend({
  outstandingQuantity: BudgetConsumptionQuantityV1Schema,
}).strict();
export type BudgetReservationOutstandingV1 = z.infer<typeof BudgetReservationOutstandingV1Schema>;

const ProjectedQuantitySchema = z.string().max(80)
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/);
const ProjectedConstraintSchema = BudgetThresholdResultV1Schema.omit({ usageQuantity: true, result: true }).extend({
  acceptedReleasedQuantity: BudgetConsumptionQuantityV1Schema,
  outstandingQuantity: BudgetConsumptionQuantityV1Schema,
  requestedQuantity: PositiveQuantitySchema,
  projectedQuantity: ProjectedQuantitySchema,
  projectedResult: z.enum(["below", "reached", "exceeded"]),
}).strict();
export const BudgetReservationProjectionV1Schema = BudgetConsumptionEvaluationV1Schema.omit({ constraints: true }).extend({
  aggregation: z.literal("sum"),
  constraints: z.array(ProjectedConstraintSchema).min(1),
  authorizesUsage: z.literal(false),
  providerEnforcementConfirmed: z.literal(false),
}).strict();
export type BudgetReservationProjectionV1 = z.infer<typeof BudgetReservationProjectionV1Schema>;

function scaled(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
}

function exact(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function scopeKey(scope: z.infer<typeof ProjectedConstraintSchema>["scope"], window: string): string {
  return JSON.stringify([window, scope]);
}

function assertEvaluationMatchesRequest(
  request: BudgetReservationRequestV1,
  evaluation: z.infer<typeof BudgetConsumptionEvaluationV1Schema>,
): void {
  if (evaluation.organizationId !== request.operation.organizationId ||
      evaluation.productId !== request.operation.productId ||
      evaluation.environment !== request.environment ||
      evaluation.aggregation !== request.aggregation ||
      evaluation.meter.meterKey !== request.operation.meter.meterKey ||
      evaluation.meter.meterVersion !== request.operation.meter.meterVersion ||
      evaluation.meter.unit !== request.operation.meter.unit) {
    throw new Error("Reservation evaluation identity, meter or environment does not match request");
  }
}

/** Pure prospective comparison. Accepted/released consumption and outstanding
 * capacity must be independently fetched from trusted storage. This function
 * preserves every policy action, including approval and pause; it never turns
 * threshold results into permission to perform an expensive operation.
 */
export function projectBudgetReservationV1(
  requestInput: unknown, evaluationInput: unknown, outstandingInputs: readonly unknown[],
): BudgetReservationProjectionV1 {
  const request = BudgetReservationRequestV1Schema.parse(requestInput);
  const evaluation = BudgetConsumptionEvaluationV1Schema.parse(evaluationInput);
  assertEvaluationMatchesRequest(request, evaluation);

  const policies = evaluation.constraints.map(constraint => ({
    schemaVersion: 1 as const, organizationId: evaluation.organizationId,
    productId: evaluation.productId, meter: evaluation.meter,
    policyId: constraint.policyId, revision: constraint.revision,
    scope: constraint.scope, window: constraint.window,
    maximumQuantity: constraint.maximumQuantity, action: constraint.action,
  }));
  const observed = new Map<string, z.infer<typeof BudgetThresholdResultV1Schema>>();
  for (const constraint of evaluation.constraints) {
    const key = scopeKey(constraint.scope, constraint.window);
    const prior = observed.get(key);
    if (prior && (prior.usageQuantity !== constraint.usageQuantity ||
        prior.from !== constraint.from || prior.until !== constraint.until)) {
      throw new Error("Inconsistent observed quantity for one reservation scope and window");
    }
    observed.set(key, constraint);
  }
  const rows = [...observed.values()].map(constraint => ({
    schemaVersion: 1 as const, organizationId: evaluation.organizationId,
    productId: evaluation.productId, meter: evaluation.meter,
    environment: evaluation.environment, evaluatedAt: evaluation.evaluatedAt,
    aggregation: evaluation.aggregation, scope: constraint.scope,
    window: constraint.window, from: constraint.from, until: constraint.until,
    quantity: constraint.usageQuantity,
  }));
  const checked = evaluateBudgetConsumptionV1(request.operation, policies, rows, {
    environment: request.environment, aggregation: request.aggregation,
    evaluatedAt: evaluation.evaluatedAt,
  });
  const checkedByPolicy = new Map(checked.constraints.map(constraint => [constraint.policyId, constraint]));
  for (const constraint of evaluation.constraints) {
    const expected = checkedByPolicy.get(constraint.policyId);
    if (!expected || JSON.stringify(expected) !== JSON.stringify(constraint)) {
      throw new Error("Reservation evaluation threshold does not match complete usage comparison");
    }
  }

  const outstanding = new Map<string, BudgetReservationOutstandingV1>();
  for (const input of outstandingInputs) {
    const row = BudgetReservationOutstandingV1Schema.parse(input);
    if (row.organizationId !== evaluation.organizationId || row.productId !== evaluation.productId ||
        row.environment !== evaluation.environment || row.aggregation !== "sum" ||
        row.evaluatedAt !== evaluation.evaluatedAt ||
        row.meter.meterKey !== evaluation.meter.meterKey ||
        row.meter.meterVersion !== evaluation.meter.meterVersion ||
        row.meter.unit !== evaluation.meter.unit) {
      throw new Error("Outstanding reservation row has a different tenant, meter, environment or snapshot");
    }
    const key = scopeKey(row.scope, row.window);
    const observedRow = observed.get(key);
    if (!observedRow || row.from !== observedRow.from || row.until !== observedRow.until) {
      throw new Error("Outstanding reservation row has an inapplicable scope or UTC window");
    }
    if (outstanding.has(key)) throw new Error("Duplicate outstanding reservation scope and window");
    outstanding.set(key, row);
  }
  for (const key of observed.keys()) {
    if (!outstanding.has(key)) throw new Error("Missing outstanding reservation scope and window");
  }

  return BudgetReservationProjectionV1Schema.parse({
    schemaVersion: 1, organizationId: evaluation.organizationId,
    productId: evaluation.productId, meter: evaluation.meter,
    environment: evaluation.environment, evaluatedAt: evaluation.evaluatedAt,
    aggregation: "sum", authorizesUsage: false,
    providerEnforcementConfirmed: false,
    constraints: evaluation.constraints.map(constraint => {
      const pending = outstanding.get(scopeKey(constraint.scope, constraint.window))!;
      const projected = scaled(constraint.usageQuantity) +
        scaled(pending.outstandingQuantity) + scaled(request.requestedQuantity);
      const maximum = scaled(constraint.maximumQuantity);
      return {
        policyId: constraint.policyId, revision: constraint.revision,
        scope: constraint.scope, window: constraint.window,
        maximumQuantity: constraint.maximumQuantity, action: constraint.action,
        from: constraint.from, until: constraint.until,
        acceptedReleasedQuantity: constraint.usageQuantity,
        outstandingQuantity: pending.outstandingQuantity,
        requestedQuantity: request.requestedQuantity,
        projectedQuantity: exact(projected),
        projectedResult: projected < maximum ? "below" : projected === maximum ? "reached" : "exceeded",
      };
    }),
  });
}

/** Initial immutable intent. The schema cannot prove the DB clock, exhaustive
 * policy set, trusted usage, atomic capacity or provider enforcement. A future
 * writer must produce recordedAt/expiresAt from its DB transaction, enforce an
 * expiry policy, re-read policy revisions, and lock all scopes before reserving.
 */
export const BudgetReservationIntentV1Schema = z.object({
  schemaVersion: z.literal(1),
  reservationId: BudgetReservationIdSchema,
  request: BudgetReservationRequestV1Schema,
  requestFingerprint: z.string().min(1).max(4096),
  projection: BudgetReservationProjectionV1Schema,
  initialState: z.literal("requested"),
  recordedAt: UtcInstantSchema,
  expiresAt: UtcInstantSchema,
  clockSource: z.literal("database_transaction"),
  provenance: AuditProvenanceSchema,
}).strict().superRefine((intent, ctx) => {
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: "custom", message, path });
  if (intent.requestFingerprint !== budgetReservationRequestFingerprintV1(intent.request)) {
    issue("Request fingerprint does not match reservation intent", ["requestFingerprint"]);
  }
  if (Date.parse(intent.expiresAt) <= Date.parse(intent.recordedAt)) {
    issue("Reservation expiry must follow the database recording instant", ["expiresAt"]);
  }
  if (Date.parse(intent.projection.evaluatedAt) > Date.parse(intent.recordedAt)) {
    issue("Projection occurs after intent recording", ["recordedAt"]);
  }
  try {
    const pseudoEvaluation = {
      schemaVersion: 1, organizationId: intent.projection.organizationId,
      productId: intent.projection.productId, meter: intent.projection.meter,
      environment: intent.projection.environment, evaluatedAt: intent.projection.evaluatedAt,
      aggregation: intent.projection.aggregation,
      constraints: intent.projection.constraints.map(constraint => ({
        policyId: constraint.policyId, revision: constraint.revision,
        scope: constraint.scope, window: constraint.window,
        maximumQuantity: constraint.maximumQuantity, action: constraint.action,
        usageQuantity: constraint.acceptedReleasedQuantity,
        from: constraint.from, until: constraint.until,
        result: scaled(constraint.acceptedReleasedQuantity) < scaled(constraint.maximumQuantity)
          ? "below" as const : scaled(constraint.acceptedReleasedQuantity) === scaled(constraint.maximumQuantity)
            ? "reached" as const : "exceeded" as const,
      })),
    };
    const unique = new Map<string, BudgetReservationOutstandingV1>();
    for (const constraint of intent.projection.constraints) {
      const key = scopeKey(constraint.scope, constraint.window);
      const prior = unique.get(key);
      if (prior && (prior.outstandingQuantity !== constraint.outstandingQuantity ||
          prior.from !== constraint.from || prior.until !== constraint.until)) {
        throw new Error("Inconsistent outstanding quantity");
      }
      unique.set(key, {
        schemaVersion: 1, organizationId: intent.projection.organizationId,
        productId: intent.projection.productId, meter: intent.projection.meter,
        environment: intent.projection.environment, evaluatedAt: intent.projection.evaluatedAt,
        aggregation: "sum", scope: constraint.scope, window: constraint.window,
        from: constraint.from, until: constraint.until,
        outstandingQuantity: constraint.outstandingQuantity,
      });
    }
    const recomputed = projectBudgetReservationV1(intent.request, pseudoEvaluation, [...unique.values()]);
    if (JSON.stringify(recomputed) !== JSON.stringify(intent.projection)) {
      throw new Error("Projection changed after recomputing exact constraints");
    }
  } catch {
    issue("Projection bindings or quantities do not match reservation request", ["projection"]);
  }
});
export type BudgetReservationIntentV1 = z.infer<typeof BudgetReservationIntentV1Schema>;

/** Input from verified accepted/released ingestion. These fields alone do not
 * attest signature verification or database acceptance; the caller must fetch
 * the accepted/released event and its immutable source envelope under tenancy.
 * Signed UsageEventV1 can now report source.operationId, projected from the
 * immutable envelope. The field proves only what the scoped signer reported;
 * settlement still needs a trusted stored-event read, provider-operation
 * binding and unique transactional event-to-reservation reconciliation.
 */
export const BudgetReservationUsageEvidenceV1Schema = z.object({
  schemaVersion: z.literal(1),
  eventId: EventIdSchema,
  organizationId: OrganizationIdSchema,
  productId: ProductIdSchema,
  productInstanceId: ProductInstanceIdSchema,
  membershipId: MembershipIdSchema.nullable(),
  teamId: TeamIdSchema.nullable(),
  capabilityKey: BudgetOperationV1Schema.shape.capabilityKey,
  meter: BudgetOperationV1Schema.shape.meter,
  environment: z.enum(["test", "production"]),
  source: SourceOperationSchema,
  sourceEventId: z.string().min(1).max(256),
  actualQuantity: PositiveQuantitySchema,
  ingestionDisposition: z.enum(["accepted", "released"]),
  occurredAt: UtcInstantSchema,
  reportedAt: UtcInstantSchema,
}).strict();
export type BudgetReservationUsageEvidenceV1 = z.infer<typeof BudgetReservationUsageEvidenceV1Schema>;

/** Structural identity validation only; not a cryptographic or DB verification. */
export function validateBudgetReservationUsageEvidenceV1(
  intentInput: unknown, evidenceInput: unknown,
): BudgetReservationUsageEvidenceV1 {
  const intent = BudgetReservationIntentV1Schema.parse(intentInput);
  const evidence = BudgetReservationUsageEvidenceV1Schema.parse(evidenceInput);
  const { request } = intent;
  if (evidence.organizationId !== request.operation.organizationId ||
      evidence.productId !== request.operation.productId ||
      evidence.productInstanceId !== request.operation.productInstanceId ||
      evidence.membershipId !== request.operation.membershipId ||
      evidence.teamId !== (request.operation.operationTeam?.teamId ?? null) ||
      evidence.capabilityKey !== request.operation.capabilityKey ||
      evidence.meter.meterKey !== request.operation.meter.meterKey ||
      evidence.meter.meterVersion !== request.operation.meter.meterVersion ||
      evidence.meter.unit !== request.operation.meter.unit ||
      evidence.environment !== request.environment ||
      evidence.source.system !== request.source.system ||
      evidence.source.operationId !== request.source.operationId) {
    throw new Error("Usage evidence does not match reservation source operation or tenant binding");
  }
  if (Date.parse(evidence.occurredAt) < Date.parse(intent.recordedAt)) {
    throw new Error("Usage evidence occurred before reservation intent");
  }
  return evidence;
}

/** Future append-only capacity state edges. `reserved` requires a separate
 * atomic DB transaction; `settled` requires accepted/released actual usage.
 * Neither state is a provider authorization result in this contract.
 */
const TransitionEdgeSchema = z.union([
  z.object({ from: z.literal("requested"), to: z.literal("reserved") }).strict(),
  z.object({ from: z.literal("requested"), to: z.literal("rejected") }).strict(),
  z.object({ from: z.literal("reserved"), to: z.literal("settled") }).strict(),
  z.object({ from: z.literal("reserved"), to: z.literal("released") }).strict(),
  z.object({ from: z.literal("reserved"), to: z.literal("expired") }).strict(),
]);
export const BudgetReservationTransitionV1Schema = z.object({
  schemaVersion: z.literal(1),
  reservationId: BudgetReservationIdSchema,
  sequence: z.number().int().positive().max(2147483647),
  edge: TransitionEdgeSchema,
  occurredAt: UtcInstantSchema,
  provenance: AuditProvenanceSchema,
  reason: z.string().trim().min(1).max(512),
  usageEvidence: BudgetReservationUsageEvidenceV1Schema.nullable(),
}).strict().superRefine((transition, ctx) => {
  if (transition.edge.to === "settled" && transition.usageEvidence === null) {
    ctx.addIssue({ code: "custom", message: "Settlement requires actual usage evidence", path: ["usageEvidence"] });
  }
  if (transition.edge.to !== "settled" && transition.usageEvidence !== null) {
    ctx.addIssue({ code: "custom", message: "Only settlement may bind actual usage evidence", path: ["usageEvidence"] });
  }
});
export type BudgetReservationTransitionV1 = z.infer<typeof BudgetReservationTransitionV1Schema>;

export function validateBudgetReservationTransitionV1(
  intentInput: unknown, transitionInput: unknown,
): BudgetReservationTransitionV1 {
  const intent = BudgetReservationIntentV1Schema.parse(intentInput);
  const transition = BudgetReservationTransitionV1Schema.parse(transitionInput);
  if (transition.reservationId !== intent.reservationId ||
      Date.parse(transition.occurredAt) < Date.parse(intent.recordedAt)) {
    throw new Error("Reservation transition does not match intent or database clock");
  }
  if (transition.edge.to === "reserved" && Date.parse(transition.occurredAt) >= Date.parse(intent.expiresAt)) {
    throw new Error("Cannot reserve capacity at or after expiry");
  }
  if (transition.edge.to === "expired" && Date.parse(transition.occurredAt) < Date.parse(intent.expiresAt)) {
    throw new Error("Cannot expire capacity before authoritative expiry");
  }
  if (transition.usageEvidence) {
    validateBudgetReservationUsageEvidenceV1(intent, transition.usageEvidence);
    if (Date.parse(transition.occurredAt) < Date.parse(transition.usageEvidence.reportedAt)) {
      throw new Error("Settlement precedes the reported usage evidence");
    }
  }
  return transition;
}

/** Actual usage reported after settlement, capacity release or expiry is
 * appended separately. It never rewrites the terminal capacity state. A
 * provider operation can emit more than one signed usage event. A future ledger must verify
 * that terminal state, enforce unique event identity and reconcile budget/cost
 * without double counting.
 */
export const BudgetReservationLateReconciliationV1Schema = z.object({
  schemaVersion: z.literal(1),
  reservationId: BudgetReservationIdSchema,
  sequence: z.number().int().positive().max(2147483647),
  afterState: z.enum(["settled", "released", "expired"]),
  evidence: BudgetReservationUsageEvidenceV1Schema,
  occurredAt: UtcInstantSchema,
  provenance: AuditProvenanceSchema,
  reason: z.string().trim().min(1).max(512),
}).strict();
export type BudgetReservationLateReconciliationV1 = z.infer<typeof BudgetReservationLateReconciliationV1Schema>;

export function validateBudgetReservationLateReconciliationV1(
  intentInput: unknown, reconciliationInput: unknown,
): BudgetReservationLateReconciliationV1 {
  const intent = BudgetReservationIntentV1Schema.parse(intentInput);
  const reconciliation = BudgetReservationLateReconciliationV1Schema.parse(reconciliationInput);
  if (reconciliation.reservationId !== intent.reservationId ||
      Date.parse(reconciliation.occurredAt) < Date.parse(intent.recordedAt)) {
    throw new Error("Late reconciliation does not match reservation intent or database clock");
  }
  if (reconciliation.afterState === "expired" && Date.parse(reconciliation.occurredAt) < Date.parse(intent.expiresAt)) {
    throw new Error("Expired reservation cannot reconcile before authoritative expiry");
  }
  validateBudgetReservationUsageEvidenceV1(intent, reconciliation.evidence);
  if (Date.parse(reconciliation.occurredAt) < Date.parse(reconciliation.evidence.reportedAt)) {
    throw new Error("Late reconciliation precedes the reported usage evidence");
  }
  return reconciliation;
}

/** Always non-authorizing, including when a projected sum is below a warning. */
export const BudgetReservationDiagnosticV1Schema = z.object({
  schemaVersion: z.literal(1),
  reservationId: BudgetReservationIdSchema,
  projection: BudgetReservationProjectionV1Schema,
  authorizesUsage: z.literal(false),
  providerEnforcementConfirmed: z.literal(false),
}).strict();
export type BudgetReservationDiagnosticV1 = z.infer<typeof BudgetReservationDiagnosticV1Schema>;
