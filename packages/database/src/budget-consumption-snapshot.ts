import { Client } from "pg";
import { z } from "zod";
import {
  BudgetConsumptionEvaluationV1Schema,
  BudgetEvaluationContextV1Schema,
  BudgetOperationV1Schema,
  BudgetPolicyScopeV1Schema,
  BudgetPolicyStoredV1Schema,
  ProductCatalogMetadataV1Schema,
  ProductCapabilityKeySchema,
  ProductIdSchema,
  ProductInstanceIdSchema,
  MembershipIdSchema,
  TeamIdSchema,
  evaluateBudgetConsumptionV1,
  projectActiveBudgetPoliciesV1,
  resolveBudgetPoliciesV1,
  type BudgetConsumptionEvaluationV1,
  type BudgetOperationV1,
} from "@company-human/contracts";

const EnvironmentV1Schema = z.enum(["test", "production"]);
const LimitWindowV1Schema = z.enum(["utc_day", "utc_week", "utc_month"]);
type BudgetPolicyScopeV1 = z.infer<typeof BudgetPolicyScopeV1Schema>;

/** The only caller input needed to build one diagnostic snapshot. */
export const BudgetConsumptionSnapshotInputV1Schema = z.object({
  actorUserId: z.string().regex(/^ch_usr_[0-9a-f]{32}$/),
  operation: BudgetOperationV1Schema,
  environment: EnvironmentV1Schema,
}).strict();
export type BudgetConsumptionSnapshotInputV1 = z.infer<typeof BudgetConsumptionSnapshotInputV1Schema>;

/**
 * A snapshot compares reported usage with configured policy thresholds. The
 * two false literals are part of the result contract: this function never
 * authorizes a request or claims that a provider will enforce a threshold.
 */
export const BudgetConsumptionSnapshotDiagnosticV1Schema = z.object({
  schemaVersion: z.literal(1),
  organizationId: z.string().regex(/^ch_org_[0-9a-f]{32}$/),
  productId: z.string().regex(/^ch_prod_[0-9a-f]{32}$/),
  operation: BudgetOperationV1Schema,
  environment: EnvironmentV1Schema,
  evaluatedAt: z.iso.datetime({ offset: true }),
  evaluation: BudgetConsumptionEvaluationV1Schema,
  providerEnforcementConfirmed: z.literal(false),
  authorizesUsage: z.literal(false),
}).strict();
export type BudgetConsumptionSnapshotDiagnosticV1 = z.infer<typeof BudgetConsumptionSnapshotDiagnosticV1Schema>;

export class BudgetConsumptionSnapshotDeniedError extends Error {
  constructor(message = "Budget consumption snapshot permission denied") {
    super(message);
    this.name = "BudgetConsumptionSnapshotDeniedError";
  }
}

export class BudgetConsumptionSnapshotIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetConsumptionSnapshotIncompleteError";
  }
}

type ProtectedRoleRow = {
  evaluated_at: string;
  isolation: string;
  read_only: string;
  snapshot_member: boolean;
  current_superuser: boolean;
  current_bypassrls: boolean;
  session_superuser: boolean;
  session_bypassrls: boolean;
  current_owns_protected: boolean;
  session_owns_protected: boolean;
};

const PROTECTED_RELATIONS = [
  "budget_policies", "budget_policy_revisions", "products", "meter_definitions",
  "product_instances", "memberships", "teams", "team_memberships", "product_memberships",
  "usage_events", "usage_quarantine_releases",
];

async function assertSnapshotConnection(client: Client): Promise<string> {
  const result = await client.query<ProtectedRoleRow>(`SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS evaluated_at,
      current_setting('transaction_isolation') AS isolation,
      current_setting('transaction_read_only') AS read_only,
      current_user = 'company_human_budget_snapshot' AS snapshot_member,
      cr.rolsuper AS current_superuser,
      cr.rolbypassrls AS current_bypassrls,
      sr.rolsuper AS session_superuser,
      sr.rolbypassrls AS session_bypassrls,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
          AND pg_has_role(current_user, c.relowner, 'member')
      ) AS current_owns_protected,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
          AND pg_has_role(session_user, c.relowner, 'member')
      ) AS session_owns_protected
    FROM pg_catalog.pg_roles cr
    JOIN pg_catalog.pg_roles sr ON sr.rolname = session_user
    WHERE cr.rolname = current_user`, [PROTECTED_RELATIONS]);
  const row = result.rows[0];
  if (!row || !row.evaluated_at || row.isolation !== "repeatable read" || row.read_only !== "on" ||
      !row.snapshot_member || row.current_superuser || row.current_bypassrls ||
      row.session_superuser || row.session_bypassrls || row.current_owns_protected ||
      row.session_owns_protected) {
    throw new BudgetConsumptionSnapshotDeniedError(
      "Budget consumption snapshot requires a restricted company_human_budget_snapshot connection",
    );
  }
  return row.evaluated_at;
}

async function assertSnapshotPermissions(client: Client, organizationId: string): Promise<void> {
  const result = await client.query<{ manages: boolean; reads: boolean }>(
    `SELECT company_human_private.has_capability($1,'budgets.manage') AS manages,
      company_human_private.has_capability($1,'usage.read.all') AS reads`, [organizationId],
  );
  if (result.rows[0]?.manages !== true || result.rows[0]?.reads !== true) {
    throw new BudgetConsumptionSnapshotDeniedError(
      "Budget consumption snapshot requires budgets.manage and usage.read.all",
    );
  }
}

type CatalogRow = {
  id: string;
  catalog_status: string;
  catalog_metadata: unknown;
};

type InstanceRow = {
  id: string;
  organization_id: string;
  product_id: string;
  desired_enabled: boolean;
  provisioning_status: string;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  status: string;
};

type TeamRow = {
  id: string;
  organization_id: string;
  status: string;
};

type ProductMembershipRow = {
  organization_id: string;
  product_instance_id: string;
  membership_id: string;
  desired_enabled: boolean;
  provisioning_status: string;
  policy_blocked: boolean;
};

async function verifyOperationBindings(client: Client, operation: BudgetOperationV1): Promise<"sum" | "maximum" | "last"> {
  const catalogResult = await client.query<CatalogRow>(`SELECT id,catalog_status,catalog_metadata
    FROM public.products WHERE id=$1`, [operation.productId]);
  const instanceResult = await client.query<InstanceRow>(`SELECT id,organization_id,product_id,desired_enabled,provisioning_status
    FROM public.product_instances
    WHERE id=$1 AND organization_id=$2 AND product_id=$3`,
  [operation.productInstanceId, operation.organizationId, operation.productId]);
  const meterResult = await client.query<{ product_id: string; meter_key: string; version: number; unit: string; aggregation: "sum" | "maximum" | "last" }>(
    `SELECT product_id,meter_key,version,unit,aggregation FROM public.meter_definitions
     WHERE product_id=$1 AND meter_key=$2 AND version=$3 AND unit=$4`,
    [operation.productId, operation.meter.meterKey, operation.meter.meterVersion, operation.meter.unit],
  );

  const catalog = catalogResult.rows[0];
  const metadata = ProductCatalogMetadataV1Schema.safeParse(catalog?.catalog_metadata);
  if (!catalog || catalog.catalog_status !== "ready" || !metadata.success ||
      !metadata.data.usageMeters.includes(operation.meter.meterKey) ||
      (operation.capabilityKey !== null && !metadata.data.supportedCapabilities.includes(operation.capabilityKey))) {
    throw new BudgetConsumptionSnapshotIncompleteError(
      "Budget consumption snapshot has no current ready catalog binding",
    );
  }

  const instance = instanceResult.rows[0];
  if (!instance || !instance.desired_enabled || instance.provisioning_status !== "active") {
    throw new BudgetConsumptionSnapshotIncompleteError(
      "Budget consumption snapshot has no current active product instance binding",
    );
  }

  const meter = meterResult.rows[0];
  if (!meter || meter.product_id !== operation.productId || meter.aggregation === undefined) {
    throw new BudgetConsumptionSnapshotIncompleteError(
      "Budget consumption snapshot has no exact current meter binding",
    );
  }

  if (operation.membershipId !== null) {
    const member = await client.query<MembershipRow>(`SELECT id,organization_id,status
      FROM public.memberships WHERE id=$1 AND organization_id=$2`,
    [operation.membershipId, operation.organizationId]);
    const membership = member.rows[0];
    if (!membership || membership.status !== "active") {
      throw new BudgetConsumptionSnapshotIncompleteError(
        "Budget consumption snapshot has no current active member binding",
      );
    }

    const mapping = await client.query<ProductMembershipRow>(`SELECT organization_id,product_instance_id,membership_id,
        desired_enabled,provisioning_status,policy_blocked
      FROM public.product_memberships
      WHERE organization_id=$1 AND product_instance_id=$2 AND membership_id=$3`,
    [operation.organizationId, operation.productInstanceId, operation.membershipId]);
    const productMembership = mapping.rows[0];
    if (!productMembership || !productMembership.desired_enabled || productMembership.policy_blocked ||
        productMembership.provisioning_status !== "active") {
      throw new BudgetConsumptionSnapshotIncompleteError(
        "Budget consumption snapshot has no current active product member binding",
      );
    }
  }

  if (operation.operationTeam !== null) {
    if (operation.membershipId === null || operation.operationTeam.membershipId !== operation.membershipId) {
      throw new BudgetConsumptionSnapshotIncompleteError(
        "Budget consumption snapshot requires a current member to bind its operation team",
      );
    }
    const teamResult = await client.query<TeamRow>(`SELECT id,organization_id,status FROM public.teams
      WHERE id=$1 AND organization_id=$2`, [operation.operationTeam.teamId, operation.organizationId]);
    const team = teamResult.rows[0];
    if (!team || team.status !== "active") {
      throw new BudgetConsumptionSnapshotIncompleteError(
        "Budget consumption snapshot has no current active team binding",
      );
    }
    const assignment = await client.query<{ membership_id: string }>(`SELECT membership_id
      FROM public.team_memberships
      WHERE organization_id=$1 AND team_id=$2 AND membership_id=$3 AND ended_at IS NULL`,
    [operation.organizationId, operation.operationTeam.teamId, operation.membershipId]);
    if (assignment.rowCount !== 1) {
      throw new BudgetConsumptionSnapshotIncompleteError(
        "Budget consumption snapshot has no current team member binding",
      );
    }
  }

  return meter.aggregation;
}

type PolicyRow = {
  id: string;
  organization_id: string;
  product_id: string;
  meter_key: string;
  meter_version: number;
  unit: string;
  window_key: string;
  scope_kind: string;
  product_instance_id: string | null;
  team_id: string | null;
  membership_id: string | null;
  capability_key: string | null;
  revision: number | null;
  maximum_quantity: string | null;
  action: string | null;
  status: string | null;
};

function scopeFromPolicyRow(row: PolicyRow): BudgetPolicyScopeV1 {
  switch (row.scope_kind) {
    case "organization": return { kind: "organization" };
    case "product": return { kind: "product", productId: ProductIdSchema.parse(row.product_id) };
    case "product_instance":
      if (!row.product_instance_id) throw new BudgetConsumptionSnapshotIncompleteError("Budget policy has an incomplete product instance scope");
      return { kind: "product_instance", productInstanceId: ProductInstanceIdSchema.parse(row.product_instance_id) };
    case "team":
      if (!row.team_id) throw new BudgetConsumptionSnapshotIncompleteError("Budget policy has an incomplete team scope");
      return { kind: "team", teamId: TeamIdSchema.parse(row.team_id) };
    case "member":
      if (!row.membership_id) throw new BudgetConsumptionSnapshotIncompleteError("Budget policy has an incomplete member scope");
      return { kind: "member", membershipId: MembershipIdSchema.parse(row.membership_id) };
    case "capability":
      if (!row.capability_key) throw new BudgetConsumptionSnapshotIncompleteError("Budget policy has an incomplete capability scope");
      return { kind: "capability", capabilityKey: ProductCapabilityKeySchema.parse(row.capability_key) };
    case "meter": return { kind: "meter" };
    default: throw new BudgetConsumptionSnapshotIncompleteError("Budget policy has an unknown scope");
  }
}

async function readCurrentPolicies(client: Client, operation: BudgetOperationV1) {
  const result = await client.query<PolicyRow>(`SELECT p.id,p.organization_id,p.product_id,p.meter_key,p.meter_version,p.unit,
      p.window_key,p.scope_kind,p.product_instance_id,p.team_id,p.membership_id,p.capability_key,
      r.revision,r.maximum_quantity::text AS maximum_quantity,r.action,r.status
    FROM public.budget_policies p
    LEFT JOIN LATERAL (
      SELECT revision,maximum_quantity,action,status
      FROM public.budget_policy_revisions r
      WHERE r.organization_id=p.organization_id AND r.budget_policy_id=p.id
      ORDER BY revision DESC LIMIT 1
    ) r ON true
    WHERE p.organization_id=$1 AND p.product_id=$2 AND p.meter_key=$3
      AND p.meter_version=$4 AND p.unit=$5
    ORDER BY p.id`, [operation.organizationId, operation.productId, operation.meter.meterKey,
    operation.meter.meterVersion, operation.meter.unit]);
  return result.rows.map(row => {
    if (row.revision === null || row.maximum_quantity === null || row.action === null || row.status === null) {
      throw new BudgetConsumptionSnapshotIncompleteError(
        `Budget policy ${row.id} has no complete current revision`,
      );
    }
    return BudgetPolicyStoredV1Schema.parse({
      schemaVersion: 1,
      policyId: row.id,
      revision: row.revision,
      organizationId: row.organization_id,
      productId: row.product_id,
      meter: { meterKey: row.meter_key, meterVersion: row.meter_version, unit: row.unit },
      window: row.window_key,
      scope: scopeFromPolicyRow(row),
      maximumQuantity: row.maximum_quantity,
      action: row.action,
      status: row.status,
    });
  });
}

type Period = { from: string; until: string };

function periodForWindow(window: "utc_day" | "utc_week" | "utc_month", evaluatedAt: string): Period {
  const instant = new Date(evaluatedAt);
  if (!Number.isFinite(instant.getTime())) throw new BudgetConsumptionSnapshotIncompleteError("Budget snapshot evaluation instant is invalid");
  let start: Date;
  if (window === "utc_month") {
    start = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1));
  } else if (window === "utc_week") {
    const day = instant.getUTCDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    start = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate() - daysSinceMonday));
  } else {
    start = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
  }
  const until = window === "utc_month"
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    : window === "utc_week"
      ? new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), until: until.toISOString() };
}

function scopeIdentity(scope: BudgetPolicyScopeV1): string {
  switch (scope.kind) {
    case "organization":
    case "meter": return scope.kind;
    case "product": return `${scope.kind}:${scope.productId}`;
    case "product_instance": return `${scope.kind}:${scope.productInstanceId}`;
    case "team": return `${scope.kind}:${scope.teamId}`;
    case "member": return `${scope.kind}:${scope.membershipId}`;
    case "capability": return `${scope.kind}:${scope.capabilityKey}`;
  }
  throw new BudgetConsumptionSnapshotIncompleteError("Budget policy has an unknown scope");
}

type ConsumptionRow = {
  scope_kind: string;
  scope_id: string;
  window_key: string;
  quantity_text: string;
  has_unknown: boolean;
};

async function readConsumption(
  client: Client,
  operation: BudgetOperationV1,
  environment: "test" | "production",
  evaluatedAt: string,
  aggregation: "sum" | "maximum" | "last",
  constraints: readonly { scope: BudgetPolicyScopeV1; window: "utc_day" | "utc_week" | "utc_month" }[],
): Promise<{ rows: ConsumptionRow[]; periods: Map<string, Period> }> {
  const periods = new Map<string, Period>();
  for (const constraint of constraints) periods.set(constraint.window, periodForWindow(constraint.window, evaluatedAt));
  const scopes = new Map<string, { kind: string; id: string; window: string }>();
  for (const constraint of constraints) {
    const scope = constraint.scope;
    const id = scopeIdentity(scope);
    const key = `${constraint.window}|${id}`;
    scopes.set(key, { kind: scope.kind, id, window: constraint.window });
  }

  const params: unknown[] = [];
  const parameter = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const scopeValues = [...scopes.values()].map(scope =>
    `(${parameter(scope.kind)}::text,${parameter(scope.id)}::text,${parameter(scope.window)}::text)`);
  const periodValues = [...periods.entries()].map(([window, period]) =>
    `(${parameter(window)}::text,${parameter(period.from)}::timestamptz,${parameter(period.until)}::timestamptz)`);
  const organization = parameter(operation.organizationId);
  const product = parameter(operation.productId);
  const meterKey = parameter(operation.meter.meterKey);
  const meterVersion = parameter(operation.meter.meterVersion);
  const unit = parameter(operation.meter.unit);
  const eventEnvironment = parameter(environment);
  const evaluated = parameter(evaluatedAt);
  const instance = parameter(operation.productInstanceId);
  const membership = parameter(operation.membershipId);
  const team = parameter(operation.operationTeam?.teamId ?? null);
  const capability = parameter(operation.capabilityKey);
  const aggregate = parameter(aggregation);
  const result = await client.query<ConsumptionRow>(`WITH policy_scopes(scope_kind,scope_id,window_key) AS (
      VALUES ${scopeValues.join(",")}
    ), periods(window_key,from_at,until_at) AS (
      VALUES ${periodValues.join(",")}
    ), event_rows AS (
      SELECT e.event_id,e.product_instance_id,e.membership_id,e.team_id,e.capability_key,
        e.quantity,e.occurred_at,e.reported_at
      FROM public.usage_events e
      WHERE e.organization_id=${organization} AND e.product_id=${product}
        AND e.meter_key=${meterKey} AND e.meter_version=${meterVersion} AND e.unit=${unit}
        AND e.environment=${eventEnvironment}
        AND e.occurred_at >= (SELECT min(from_at) FROM periods)
        AND e.occurred_at < (SELECT max(until_at) FROM periods)
        AND e.occurred_at <= ${evaluated}::timestamptz
        AND (e.disposition='accepted' OR EXISTS (
          SELECT 1 FROM public.usage_quarantine_releases release
          WHERE release.event_id=e.event_id AND release.organization_id=e.organization_id
        ))
    ), matched AS (
      SELECT s.scope_kind,s.scope_id,s.window_key,
        e.event_id,e.quantity,e.occurred_at,e.reported_at
      FROM policy_scopes s
      JOIN periods p ON p.window_key=s.window_key
      LEFT JOIN event_rows e ON e.occurred_at >= p.from_at AND e.occurred_at < p.until_at
        AND (
          s.scope_kind IN ('organization','product','meter')
          OR (s.scope_kind='product_instance' AND e.product_instance_id=${instance})
          OR (s.scope_kind='member' AND e.membership_id=${membership})
          OR (s.scope_kind='team' AND e.team_id=${team})
          OR (s.scope_kind='capability' AND e.capability_key=${capability})
        )
    ), aggregates AS (
      SELECT scope_kind,scope_id,window_key,
        CASE ${aggregate}
          WHEN 'sum' THEN COALESCE(sum(quantity),0::numeric)
          WHEN 'maximum' THEN COALESCE(max(quantity),0::numeric)
          WHEN 'last' THEN COALESCE(
            (array_agg(quantity ORDER BY occurred_at DESC,reported_at DESC,event_id DESC)
              FILTER (WHERE event_id IS NOT NULL))[1],0::numeric)
        END::text AS quantity_text
      FROM matched GROUP BY scope_kind,scope_id,window_key
    ), unknowns AS (
      SELECT s.scope_kind,s.scope_id,s.window_key,
        COALESCE(bool_or(e.event_id IS NOT NULL AND CASE s.scope_kind
          WHEN 'member' THEN e.membership_id IS NULL
          WHEN 'team' THEN e.team_id IS NULL
          WHEN 'capability' THEN e.capability_key IS NULL
          ELSE false END),false) AS has_unknown
      FROM policy_scopes s
      JOIN periods p ON p.window_key=s.window_key
      LEFT JOIN event_rows e ON e.occurred_at >= p.from_at AND e.occurred_at < p.until_at
      GROUP BY s.scope_kind,s.scope_id,s.window_key
    )
    SELECT a.scope_kind,a.scope_id,a.window_key,a.quantity_text,u.has_unknown
    FROM aggregates a JOIN unknowns u USING (scope_kind,scope_id,window_key)
    ORDER BY a.window_key,a.scope_kind,a.scope_id`, params);

  const expectedKeys = new Set(scopes.keys());
  const rowKey = (row: ConsumptionRow): string => `${row.window_key}|${row.scope_kind === "organization" || row.scope_kind === "meter" ? row.scope_kind : row.scope_id}`;
  const actualKeys = new Set(result.rows.map(rowKey));
  if (result.rows.length !== expectedKeys.size || actualKeys.size !== expectedKeys.size ||
      result.rows.some(row => !expectedKeys.has(rowKey(row)))) {
    throw new BudgetConsumptionSnapshotIncompleteError("Budget consumption snapshot does not cover every applicable scope and window");
  }
  const unknown = new Set(result.rows.filter(row => row.has_unknown).map(row => row.scope_kind));
  if (unknown.has("member")) throw new BudgetConsumptionSnapshotIncompleteError("Budget consumption snapshot has unknown member attribution");
  if (unknown.has("team")) throw new BudgetConsumptionSnapshotIncompleteError("Budget consumption snapshot has unknown team attribution");
  if (unknown.has("capability")) throw new BudgetConsumptionSnapshotIncompleteError("Budget consumption snapshot has unknown capability attribution");
  return { rows: result.rows, periods };
}

function scopeFromConsumptionRow(row: ConsumptionRow, operation: BudgetOperationV1): BudgetPolicyScopeV1 {
  switch (row.scope_kind) {
    case "organization": return { kind: "organization" };
    case "product": return { kind: "product", productId: operation.productId };
    case "product_instance": return { kind: "product_instance", productInstanceId: operation.productInstanceId };
    case "meter": return { kind: "meter" };
    case "team":
      if (!operation.operationTeam) throw new BudgetConsumptionSnapshotIncompleteError("Budget consumption snapshot lost team attribution");
      return { kind: "team", teamId: operation.operationTeam.teamId };
    case "member":
      if (!operation.membershipId) throw new BudgetConsumptionSnapshotIncompleteError("Budget consumption snapshot lost member attribution");
      return { kind: "member", membershipId: operation.membershipId };
    case "capability":
      if (!operation.capabilityKey) throw new BudgetConsumptionSnapshotIncompleteError("Budget consumption snapshot lost capability attribution");
      return { kind: "capability", capabilityKey: operation.capabilityKey };
    default: throw new BudgetConsumptionSnapshotIncompleteError("Budget consumption snapshot returned an unknown scope");
  }
}

/** Internal only: the wrapper establishes the first statement and snapshot instant. */
async function readBudgetConsumptionSnapshotInTransaction(
  client: Client,
  input: z.input<typeof BudgetConsumptionSnapshotInputV1Schema>,
): Promise<BudgetConsumptionSnapshotDiagnosticV1> {
  const parsed = BudgetConsumptionSnapshotInputV1Schema.parse(input);
  const evaluatedAt = await assertSnapshotConnection(client);
  await client.query(
    "SELECT set_config('company_human.user_id',$1,true), set_config('company_human.organization_id',$2,true)",
    [parsed.actorUserId, parsed.operation.organizationId],
  );
  await assertSnapshotPermissions(client, parsed.operation.organizationId);
  const aggregation = await verifyOperationBindings(client, parsed.operation);
  const policies = await readCurrentPolicies(client, parsed.operation);
  const activePolicies = projectActiveBudgetPoliciesV1(parsed.operation, policies);
  const resolution = resolveBudgetPoliciesV1(parsed.operation, activePolicies);
  if (resolution.constraints.length === 0) {
    throw new BudgetConsumptionSnapshotIncompleteError("No applicable budget policy for this operation");
  }
  const { rows, periods } = await readConsumption(client, parsed.operation, parsed.environment, evaluatedAt,
    aggregation, resolution.constraints.map(constraint => ({ scope: constraint.scope, window: constraint.window })));
  const consumption = rows.map(row => {
    const period = periods.get(row.window_key);
    if (!period) throw new BudgetConsumptionSnapshotIncompleteError("Budget snapshot period unavailable");
    return {
      schemaVersion: 1 as const,
      organizationId: parsed.operation.organizationId,
      productId: parsed.operation.productId,
      meter: parsed.operation.meter,
      window: LimitWindowV1Schema.parse(row.window_key),
      scope: scopeFromConsumptionRow(row, parsed.operation),
      quantity: row.quantity_text,
      environment: parsed.environment,
      evaluatedAt,
      from: period.from,
      until: period.until,
      aggregation,
    };
  });
  const context = BudgetEvaluationContextV1Schema.parse({ environment: parsed.environment, aggregation, evaluatedAt });
  const evaluation: BudgetConsumptionEvaluationV1 = evaluateBudgetConsumptionV1(
    parsed.operation, activePolicies, consumption, context,
  );
  return BudgetConsumptionSnapshotDiagnosticV1Schema.parse({
    schemaVersion: 1,
    organizationId: parsed.operation.organizationId,
    productId: parsed.operation.productId,
    operation: parsed.operation,
    environment: parsed.environment,
    evaluatedAt,
    evaluation,
    providerEnforcementConfirmed: false,
    authorizesUsage: false,
  });
}

/** Dedicated server connection. The caller must connect as a member of the restricted snapshot role. */
export async function readBudgetConsumptionSnapshot(
  databaseUrl: string,
  input: z.input<typeof BudgetConsumptionSnapshotInputV1Schema>,
): Promise<BudgetConsumptionSnapshotDiagnosticV1> {
  if (!databaseUrl) throw new Error("Database URL is required");
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    // The role is NOLOGIN. A dedicated runtime login must be granted only this
    // role; SET ROLE makes the table grants and RLS policies explicit before
    // any snapshot read occurs. The helper still rejects privileged session
    // identities and table owners.
    await client.query("SET LOCAL ROLE company_human_budget_snapshot");
    const result = await readBudgetConsumptionSnapshotInTransaction(client, input);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export const evaluateBudgetConsumptionSnapshot = readBudgetConsumptionSnapshot;
