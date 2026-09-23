import { z } from "zod";
import {
  BudgetOperationV1Schema,
  BudgetPolicyScopeV1Schema,
  BudgetPolicyV1Schema,
  resolveBudgetPoliciesV1,
  type BudgetOperationV1,
  type BudgetResolutionV1,
} from "./budget-policy.js";
import { OrganizationIdSchema, ProductIdSchema } from "./ids.js";
import { MeterDefinitionV1Schema } from "./usage-events.js";
import { LimitWindowSchema } from "./usage-limits.js";

const MeterBindingV1Schema = z.object({
  meterKey: MeterDefinitionV1Schema.shape.meterKey,
  meterVersion: MeterDefinitionV1Schema.shape.version,
  unit: MeterDefinitionV1Schema.shape.unit,
}).strict();

const EnvironmentV1Schema = z.enum(["test", "production"]);
const AggregationV1Schema = MeterDefinitionV1Schema.shape.aggregation;
const EvaluationResultV1Schema = z.enum(["below", "reached", "exceeded"]);
const EvaluationInstantV1Schema = z.iso.datetime({ offset: true });
const UtcInstantV1Schema = EvaluationInstantV1Schema.refine(value => value.endsWith("Z"), "Budget periods must use UTC timestamps");
type BudgetPolicyScopeV1 = z.infer<typeof BudgetPolicyScopeV1Schema>;

/** Caller-supplied snapshot identity, sourced from the trusted read context. */
export const BudgetEvaluationContextV1Schema = z.object({
  environment: EnvironmentV1Schema,
  aggregation: AggregationV1Schema,
  evaluatedAt: EvaluationInstantV1Schema,
}).strict();
export type BudgetEvaluationContextV1 = z.infer<typeof BudgetEvaluationContextV1Schema>;

/**
 * Consumption can be larger than a configured policy quantity. In particular,
 * a database sum can exceed the twelve integer digits accepted by
 * LimitQuantitySchema. Keep the same six-decimal precision without imposing a
 * finite integer-digit cap, and never coerce the value to a JavaScript number.
 */
export const BudgetConsumptionQuantityV1Schema = z.string()
  .max(64, "Budget consumption quantity is too long")
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/)
  .transform(canonicalQuantity);
export type BudgetConsumptionQuantityV1 = z.infer<typeof BudgetConsumptionQuantityV1Schema>;

/** One complete usage quantity for one applicable scope and UTC calendar window. */
export const BudgetConsumptionV1Schema = z.object({
  schemaVersion: z.literal(1),
  organizationId: OrganizationIdSchema,
  productId: ProductIdSchema,
  meter: MeterBindingV1Schema,
  window: LimitWindowSchema,
  scope: BudgetPolicyScopeV1Schema,
  quantity: BudgetConsumptionQuantityV1Schema,
  /** The environment is part of the usage identity and may not be mixed. */
  environment: EnvironmentV1Schema,
  /** All rows must come from one evaluation snapshot. */
  evaluatedAt: EvaluationInstantV1Schema,
  /** Exact half-open UTC calendar period represented by this aggregate. */
  from: UtcInstantV1Schema,
  until: UtcInstantV1Schema,
  /** Every row must use the same registered meter aggregation semantics. */
  aggregation: AggregationV1Schema,
}).strict();
export type BudgetConsumptionV1 = z.infer<typeof BudgetConsumptionV1Schema>;

export const BudgetThresholdResultV1Schema = z.object({
  policyId: BudgetPolicyV1Schema.shape.policyId,
  revision: BudgetPolicyV1Schema.shape.revision,
  scope: BudgetPolicyScopeV1Schema,
  window: LimitWindowSchema,
  maximumQuantity: BudgetPolicyV1Schema.shape.maximumQuantity,
  action: BudgetPolicyV1Schema.shape.action,
  usageQuantity: BudgetConsumptionQuantityV1Schema,
  from: UtcInstantV1Schema,
  until: UtcInstantV1Schema,
  result: EvaluationResultV1Schema,
}).strict();
export type BudgetThresholdResultV1 = z.infer<typeof BudgetThresholdResultV1Schema>;

/**
 * A read-only snapshot of every applicable threshold. This result contains no
 * allow/deny decision and no provider-enforcement claim.
 */
export const BudgetConsumptionEvaluationV1Schema = z.object({
  schemaVersion: z.literal(1),
  organizationId: OrganizationIdSchema,
  productId: ProductIdSchema,
  meter: MeterBindingV1Schema,
  environment: EnvironmentV1Schema,
  evaluatedAt: EvaluationInstantV1Schema,
  aggregation: AggregationV1Schema,
  constraints: z.array(BudgetThresholdResultV1Schema).min(1),
}).strict();
export type BudgetConsumptionEvaluationV1 = z.infer<typeof BudgetConsumptionEvaluationV1Schema>;

function canonicalQuantity(value: string): string {
  const [whole, fraction] = value.split(".");
  if (!fraction) return whole!;
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}

function scaledQuantity(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
}

function scopeIdentity(scope: BudgetPolicyScopeV1): string {
  switch (scope.kind) {
    case "organization":
    case "meter":
      return scope.kind;
    case "product":
      return `${scope.kind}:${scope.productId}`;
    case "product_instance":
      return `${scope.kind}:${scope.productInstanceId}`;
    case "team":
      return `${scope.kind}:${scope.teamId}`;
    case "member":
      return `${scope.kind}:${scope.membershipId}`;
    case "capability":
      return `${scope.kind}:${scope.capabilityKey}`;
  }
  throw new Error("Unknown budget policy scope");
}

function scopeWindowKey(scope: BudgetPolicyScopeV1, window: BudgetConsumptionV1["window"]): string {
  return `${window}|${scopeIdentity(scope)}`;
}

function meterMatches(left: BudgetOperationV1["meter"], right: BudgetConsumptionV1["meter"]): boolean {
  return left.meterKey === right.meterKey && left.meterVersion === right.meterVersion && left.unit === right.unit;
}

function scopeMatchesOperation(scope: BudgetPolicyScopeV1, operation: BudgetOperationV1): boolean {
  switch (scope.kind) {
    case "organization":
    case "meter":
      return true;
    case "product":
      return scope.productId === operation.productId;
    case "product_instance":
      return scope.productInstanceId === operation.productInstanceId;
    case "team":
      return operation.operationTeam?.teamId === scope.teamId;
    case "member":
      return operation.membershipId === scope.membershipId;
    case "capability":
      return operation.capabilityKey === scope.capabilityKey;
  }
  return false;
}

function instantMillis(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid budget evaluation instant");
  return parsed;
}

function assertSingleInstant(rows: readonly BudgetConsumptionV1[]): string {
  const first = rows[0]!.evaluatedAt;
  const firstMillis = instantMillis(first);
  if (rows.some(row => instantMillis(row.evaluatedAt) !== firstMillis)) {
    throw new Error("Budget consumption rows must use one evaluation instant");
  }
  return first;
}

function assertSingleAggregation(rows: readonly BudgetConsumptionV1[]): BudgetConsumptionV1["aggregation"] {
  const first = rows[0]?.aggregation;
  if (!first || rows.some(row => row.aggregation !== first)) {
    throw new Error("Budget consumption rows must use one meter aggregation mode");
  }
  return first;
}

function parseRows(consumptionInputs: readonly unknown[]): BudgetConsumptionV1[] {
  return consumptionInputs.map(input => BudgetConsumptionV1Schema.parse(input));
}

function assertUtcWindowPeriod(row: BudgetConsumptionV1): void {
  const from = Date.parse(row.from);
  const until = Date.parse(row.until);
  const evaluatedAt = Date.parse(row.evaluatedAt);
  if (!Number.isFinite(from) || !Number.isFinite(until) || !Number.isFinite(evaluatedAt) || from >= until) {
    throw new Error("Budget consumption row has an invalid UTC period");
  }
  if (evaluatedAt < from || evaluatedAt >= until) {
    throw new Error("Budget evaluation instant must fall within its UTC period");
  }
  const fromDate = new Date(from);
  const midnight = fromDate.getUTCHours() === 0 && fromDate.getUTCMinutes() === 0 &&
    fromDate.getUTCSeconds() === 0 && fromDate.getUTCMilliseconds() === 0;
  if (!midnight) throw new Error("Budget consumption period must start at UTC midnight");
  if (row.window === "utc_week" && fromDate.getUTCDay() !== 1) {
    throw new Error("Budget week must start on Monday UTC");
  }
  if (row.window === "utc_month" && fromDate.getUTCDate() !== 1) {
    throw new Error("Budget month must start on the first day UTC");
  }
  const expectedUntil = row.window === "utc_day"
    ? Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate() + 1)
    : row.window === "utc_week"
      ? Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate() + 7)
      : Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + 1, 1);
  if (until !== expectedUntil) throw new Error("Budget consumption period does not match its UTC window");
}

/**
 * Evaluate complete, caller-supplied usage aggregates against the pure budget
 * policy resolution. The caller remains responsible for tenant authorization,
 * provenance, team membership verification and any downstream enforcement.
 */
export function evaluateBudgetConsumptionV1(
  operationInput: unknown,
  policyInputs: readonly unknown[],
  consumptionInputs: readonly unknown[],
  contextInput: unknown,
): BudgetConsumptionEvaluationV1 {
  const operation = BudgetOperationV1Schema.parse(operationInput);
  const context = BudgetEvaluationContextV1Schema.parse(contextInput);
  const resolution: BudgetResolutionV1 = resolveBudgetPoliciesV1(operation, policyInputs);
  if (resolution.constraints.length === 0) {
    throw new Error("No applicable budget policy for this operation");
  }
  const rows = parseRows(consumptionInputs);

  if (rows.length === 0) {
    throw new Error("Missing budget consumption row for an applicable scope and window");
  }

  const evaluatedAt = assertSingleInstant(rows);
  const aggregation = assertSingleAggregation(rows);
  const environments = new Set(rows.map(row => row.environment));
  if (environments.size > 1) throw new Error("Budget consumption rows must use one environment");
  if (environments.values().next().value !== context.environment) {
    throw new Error("Budget consumption rows do not match the evaluation environment");
  }
  if (aggregation !== context.aggregation) {
    throw new Error("Budget consumption rows do not match the registered meter aggregation");
  }
  if (instantMillis(evaluatedAt) !== instantMillis(context.evaluatedAt)) {
    throw new Error("Budget consumption rows do not match the evaluation instant");
  }
  const periodByWindow = new Map<BudgetConsumptionV1["window"], string>();
  for (const row of rows) {
    assertUtcWindowPeriod(row);
    const period = `${row.from}|${row.until}`;
    const existing = periodByWindow.get(row.window);
    if (existing !== undefined && existing !== period) {
      throw new Error("Budget consumption rows for one UTC window must use one period");
    }
    periodByWindow.set(row.window, period);
  }

  const expected = new Map<string, BudgetPolicyScopeV1>();
  for (const constraint of resolution.constraints) {
    const key = scopeWindowKey(constraint.scope, constraint.window);
    if (!expected.has(key)) expected.set(key, constraint.scope);
  }

  const byKey = new Map<string, BudgetConsumptionV1>();
  for (const row of rows) {
    if (row.organizationId !== operation.organizationId || row.productId !== operation.productId) {
      throw new Error("Budget consumption row crosses organization or product boundary");
    }
    if (!meterMatches(operation.meter, row.meter)) {
      throw new Error("Budget consumption row has a different meter, version, or unit");
    }
    if (!scopeMatchesOperation(row.scope, operation)) {
      throw new Error("Budget consumption row has a scope that does not match the operation");
    }
    const key = scopeWindowKey(row.scope, row.window);
    if (!expected.has(key)) {
      throw new Error("Budget consumption row is not an applicable policy scope and window");
    }
    if (byKey.has(key)) throw new Error("Duplicate budget consumption scope and window");
    byKey.set(key, row);
  }

  for (const key of expected.keys()) {
    if (!byKey.has(key)) throw new Error("Missing budget consumption row for an applicable scope and window");
  }

  const constraints = resolution.constraints.map(constraint => {
    const row = byKey.get(scopeWindowKey(constraint.scope, constraint.window));
    if (!row) throw new Error("Missing budget consumption row for an applicable scope and window");
    const usage = scaledQuantity(row.quantity);
    const maximum = scaledQuantity(constraint.maximumQuantity);
    const result = usage < maximum ? "below" : usage === maximum ? "reached" : "exceeded";
    return {
      policyId: constraint.policyId,
      revision: constraint.revision,
      scope: constraint.scope,
      window: constraint.window,
      maximumQuantity: constraint.maximumQuantity,
      action: constraint.action,
      usageQuantity: row.quantity,
      from: row.from,
      until: row.until,
      result,
    } satisfies BudgetThresholdResultV1;
  });

  const firstRow = rows[0];
  return BudgetConsumptionEvaluationV1Schema.parse({
    schemaVersion: 1,
    organizationId: operation.organizationId,
    productId: operation.productId,
    meter: operation.meter,
    environment: firstRow!.environment,
    evaluatedAt: context.evaluatedAt,
    aggregation: context.aggregation,
    constraints,
  });
}
