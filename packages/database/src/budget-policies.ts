import { Client } from "pg";
import { z } from "zod";
import {
  BudgetIdSchema, BudgetPolicyActionV1Schema, BudgetPolicyScopeV1Schema,
  BudgetPolicyStatusV1Schema, BudgetPolicyStoredV1Schema, BudgetPolicyV1Schema,
  LimitQuantitySchema, MembershipIdSchema, OrganizationIdSchema, ProductCatalogMetadataV1Schema,
  ProductCapabilityKeySchema, ProductIdSchema, ProductInstanceIdSchema, TeamIdSchema,
  UserIdSchema, createCanonicalId, type BudgetPolicyStoredV1,
} from "@company-human/contracts";
import { setServiceContext } from "./service-context.js";
import { appendIdentityAudit } from "./identity-audit.js";

const Meter = BudgetPolicyV1Schema.shape.meter;
const Create = BudgetPolicyV1Schema.omit({ schemaVersion: true, policyId: true, revision: true }).extend({
  actorUserId: UserIdSchema,
  status: BudgetPolicyStatusV1Schema,
}).strict();
const Revise = z.object({
  actorUserId: UserIdSchema, organizationId: OrganizationIdSchema, policyId: BudgetIdSchema,
  expectedRevision: z.number().int().positive().max(2147483646),
  maximumQuantity: LimitQuantitySchema, action: BudgetPolicyActionV1Schema,
  status: BudgetPolicyStatusV1Schema,
}).strict();
const Read = z.object({
  actorUserId: UserIdSchema, organizationId: OrganizationIdSchema,
  productId: ProductIdSchema, meter: Meter,
}).strict();

export class BudgetPolicyConflict extends Error {
  constructor() { super("Budget policy changed. Reload before saving."); this.name = "BudgetPolicyConflict"; }
}
export class BudgetPolicyDenied extends Error {
  constructor() { super("Budget policy unavailable or permission denied"); this.name = "BudgetPolicyDenied"; }
}
export class BudgetPolicyInvalid extends Error {
  constructor() { super("Budget policy scope or meter invalid"); this.name = "BudgetPolicyInvalid"; }
}

function isDatabaseAuthorityDenial(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42501";
}

type PolicyRow = {
  id: string; organization_id: string; product_id: string; meter_key: string;
  meter_version: number; unit: string; window_key: string; scope_kind: BudgetPolicyStoredV1["scope"]["kind"];
  product_instance_id: string | null; team_id: string | null; membership_id: string | null;
  capability_key: string | null; revision: number; maximum_quantity: string;
  action: string; status: string;
};

function scopeFromRow(row: PolicyRow): BudgetPolicyStoredV1["scope"] {
  switch (row.scope_kind) {
    case "organization": return { kind: "organization" };
    case "product": return { kind: "product", productId: ProductIdSchema.parse(row.product_id) };
    case "product_instance": return { kind: "product_instance", productInstanceId: ProductInstanceIdSchema.parse(row.product_instance_id) };
    case "team": return { kind: "team", teamId: TeamIdSchema.parse(row.team_id) };
    case "member": return { kind: "member", membershipId: MembershipIdSchema.parse(row.membership_id) };
    case "capability": return { kind: "capability", capabilityKey: ProductCapabilityKeySchema.parse(row.capability_key) };
    case "meter": return { kind: "meter" };
  }
}

function storedFromRow(row: PolicyRow): BudgetPolicyStoredV1 {
  return BudgetPolicyStoredV1Schema.parse({ schemaVersion: 1, policyId: row.id,
    revision: row.revision, organizationId: row.organization_id, productId: row.product_id,
    meter: { meterKey: row.meter_key, meterVersion: row.meter_version, unit: row.unit },
    window: row.window_key, scope: scopeFromRow(row), maximumQuantity: row.maximum_quantity,
    action: row.action, status: row.status });
}

async function actorMembership(client: Client, organizationId: string, actorUserId: string) {
  const actor = await client.query<{ id: string }>(`SELECT id FROM public.memberships
    WHERE organization_id=$1 AND user_id=$2 AND status='active'
      AND company_human_private.has_capability($1,'budgets.manage')`, [organizationId, actorUserId]);
  if (actor.rowCount !== 1) throw new BudgetPolicyDenied();
  return MembershipIdSchema.parse(actor.rows[0]!.id);
}

async function assertRegisteredMeter(client: Client, productId: string, meter: z.infer<typeof Meter>, capabilityKey: string | null, requireReady: boolean) {
  const registered = await client.query(`SELECT 1 FROM public.meter_definitions
    WHERE product_id=$1 AND meter_key=$2 AND version=$3 AND unit=$4`,
  [productId, meter.meterKey, meter.meterVersion, meter.unit]);
  if (registered.rowCount !== 1) throw new BudgetPolicyInvalid();
  if (!requireReady) return;
  const product = await client.query<{ catalog_status: string; catalog_metadata: unknown }>(
    "SELECT catalog_status,catalog_metadata FROM public.products WHERE id=$1", [productId]);
  const catalog = ProductCatalogMetadataV1Schema.safeParse(product.rows[0]?.catalog_metadata);
  if (!product.rows[0] || product.rows[0].catalog_status !== "ready" || !catalog.success ||
    !catalog.data.usageMeters.includes(meter.meterKey) ||
    (capabilityKey !== null && !catalog.data.supportedCapabilities.includes(capabilityKey))) {
    throw new BudgetPolicyInvalid();
  }
}

async function assertScopeTarget(client: Client, organizationId: string, productId: string, scope: z.infer<typeof BudgetPolicyScopeV1Schema>) {
  let result;
  switch (scope.kind) {
    case "product":
      if (scope.productId !== productId) throw new BudgetPolicyInvalid();
      return;
    case "product_instance":
      result = await client.query("SELECT 1 FROM public.product_instances WHERE organization_id=$1 AND product_id=$2 AND id=$3",
        [organizationId, productId, scope.productInstanceId]);
      break;
    case "team":
      result = await client.query("SELECT 1 FROM public.teams WHERE organization_id=$1 AND id=$2", [organizationId, scope.teamId]);
      break;
    case "member":
      result = await client.query("SELECT 1 FROM public.memberships WHERE organization_id=$1 AND id=$2", [organizationId, scope.membershipId]);
      break;
    default: return;
  }
  if (result.rowCount !== 1) throw new BudgetPolicyDenied();
}

function scopeColumns(scope: z.infer<typeof BudgetPolicyScopeV1Schema>) {
  return {
    productInstanceId: scope.kind === "product_instance" ? scope.productInstanceId : null,
    teamId: scope.kind === "team" ? scope.teamId : null,
    membershipId: scope.kind === "member" ? scope.membershipId : null,
    capabilityKey: scope.kind === "capability" ? scope.capabilityKey : null,
  };
}

/** Append a desired policy. This stores configuration; it does not reserve spend or enable a provider. */
export async function createBudgetPolicy(databaseUrl: string, input: z.input<typeof Create>): Promise<BudgetPolicyStoredV1> {
  const parsed = Create.parse(input);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    // Serialize with catalog, permission, organization, and identity changes before
    // reading mutable authority. The INSERT trigger repeats this for direct SQL.
    await client.query("SELECT company_human_private.lock_budget_policy_authority($1,$2)",
      [parsed.organizationId, parsed.productId]);
    const actorMembershipId = await actorMembership(client, parsed.organizationId, parsed.actorUserId);
    await assertRegisteredMeter(client, parsed.productId, parsed.meter,
      parsed.scope.kind === "capability" ? parsed.scope.capabilityKey : null, parsed.status === "active");
    await assertScopeTarget(client, parsed.organizationId, parsed.productId, parsed.scope);
    const policyId = createCanonicalId("budget");
    const target = scopeColumns(parsed.scope);
    await client.query(`INSERT INTO public.budget_policies
      (id,organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind,
       product_instance_id,team_id,membership_id,capability_key,created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [policyId, parsed.organizationId, parsed.productId, parsed.meter.meterKey, parsed.meter.meterVersion,
      parsed.meter.unit, parsed.window, parsed.scope.kind, target.productInstanceId, target.teamId,
      target.membershipId, target.capabilityKey, parsed.actorUserId]);
    await client.query(`INSERT INTO public.budget_policy_revisions
      (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
      VALUES ($1,$2,1,$3,$4,$5,$6)`, [parsed.organizationId, policyId,
      parsed.maximumQuantity, parsed.action, parsed.status, parsed.actorUserId]);
    await appendIdentityAudit(client, { organizationId: parsed.organizationId, actorUserId: parsed.actorUserId,
      actorMembershipId, action: "budget.policy.created", targetType: "budget_policy", targetId: policyId,
      afterState: { revision: 1, productId: parsed.productId, meter: parsed.meter, window: parsed.window,
        scope: parsed.scope, maximumQuantity: parsed.maximumQuantity, action: parsed.action, status: parsed.status } });
    const result = BudgetPolicyStoredV1Schema.parse({ schemaVersion: 1, policyId, revision: 1,
      organizationId: parsed.organizationId, productId: parsed.productId, meter: parsed.meter,
      window: parsed.window, scope: parsed.scope, maximumQuantity: parsed.maximumQuantity,
      action: parsed.action, status: parsed.status });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (isDatabaseAuthorityDenial(error)) throw new BudgetPolicyDenied();
    throw error;
  } finally { await client.end(); }
}

/** Append a new revision, including explicit disable/re-enable. Immutable history remains queryable. */
export async function reviseBudgetPolicy(databaseUrl: string, input: z.input<typeof Revise>): Promise<BudgetPolicyStoredV1> {
  const parsed = Revise.parse(input);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    const binding = await client.query<{ product_id: string }>(
      "SELECT product_id FROM public.budget_policies WHERE organization_id=$1 AND id=$2",
      [parsed.organizationId, parsed.policyId]);
    if (binding.rowCount !== 1) throw new BudgetPolicyDenied();
    await client.query("SELECT company_human_private.lock_budget_policy_authority($1,$2)",
      [parsed.organizationId, binding.rows[0]!.product_id]);
    const actorMembershipId = await actorMembership(client, parsed.organizationId, parsed.actorUserId);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`budget-policy-revision:${parsed.policyId}`]);
    const current = await client.query<PolicyRow>(`SELECT p.*,r.revision,r.maximum_quantity,r.action,r.status FROM public.budget_policies p
      JOIN LATERAL (SELECT revision,maximum_quantity,action,status FROM public.budget_policy_revisions
        WHERE organization_id=p.organization_id AND budget_policy_id=p.id ORDER BY revision DESC LIMIT 1) r ON true
      WHERE p.organization_id=$1 AND p.id=$2`, [parsed.organizationId, parsed.policyId]);
    if (current.rowCount !== 1) throw new BudgetPolicyDenied();
    const before = storedFromRow(current.rows[0]!);
    if (before.revision !== parsed.expectedRevision) throw new BudgetPolicyConflict();
    if (parsed.status === "active") await assertRegisteredMeter(client, before.productId, before.meter,
      before.scope.kind === "capability" ? before.scope.capabilityKey : null, true);
    const nextRevision = before.revision + 1;
    await client.query(`INSERT INTO public.budget_policy_revisions
      (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [parsed.organizationId, parsed.policyId, nextRevision,
      parsed.maximumQuantity, parsed.action, parsed.status, parsed.actorUserId]);
    await appendIdentityAudit(client, { organizationId: parsed.organizationId, actorUserId: parsed.actorUserId,
      actorMembershipId, action: "budget.policy.revised", targetType: "budget_policy", targetId: parsed.policyId,
      beforeState: { revision: before.revision, maximumQuantity: before.maximumQuantity,
        action: before.action, status: before.status },
      afterState: { revision: nextRevision, maximumQuantity: parsed.maximumQuantity,
        action: parsed.action, status: parsed.status } });
    const result = BudgetPolicyStoredV1Schema.parse({ ...before, revision: nextRevision,
      maximumQuantity: parsed.maximumQuantity, action: parsed.action, status: parsed.status });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (isDatabaseAuthorityDenial(error)) throw new BudgetPolicyDenied();
    throw error;
  } finally { await client.end(); }
}

/** Complete current configuration for one exact tenant/product/meter. No pagination or spend decision. */
export async function readBudgetPolicies(databaseUrl: string, input: z.input<typeof Read>): Promise<BudgetPolicyStoredV1[]> {
  const parsed = Read.parse(input);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    await actorMembership(client, parsed.organizationId, parsed.actorUserId);
    const rows = await client.query<PolicyRow>(`SELECT p.*,r.revision,r.maximum_quantity,r.action,r.status FROM public.budget_policies p
      JOIN LATERAL (SELECT revision,maximum_quantity,action,status FROM public.budget_policy_revisions
        WHERE organization_id=p.organization_id AND budget_policy_id=p.id ORDER BY revision DESC LIMIT 1) r ON true
      WHERE p.organization_id=$1 AND p.product_id=$2 AND p.meter_key=$3 AND p.meter_version=$4 AND p.unit=$5
      ORDER BY p.id`, [parsed.organizationId, parsed.productId,
      parsed.meter.meterKey, parsed.meter.meterVersion, parsed.meter.unit]);
    const policies = rows.rows.map(storedFromRow);
    await client.query("COMMIT");
    return policies;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}
