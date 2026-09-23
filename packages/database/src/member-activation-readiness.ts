import { Client } from "pg";
import {
  AppliedUsageLimitStateSchema, CapabilityAdapterResultSchema, OrganizationIdSchema,
  ProductCatalogMetadataV1Schema, ProductMembershipIdSchema, StagedCapabilitiesStateSchema,
  ProductInstanceIdSchema, UsageLimitAdapterResultSchema, UserIdSchema, matchesAppliedUsageLimit,
  matchesStagedCapabilities,
} from "@company-human/contracts";
import { readCurrentCapabilityInputs } from "./capability-source.js";
import { setServiceContext } from "./service-context.js";

export type ActivationReadinessReason =
  | "membership_unavailable" | "identity_inactive" | "product_unavailable" | "role_not_authorized"
  | "mapping_not_suspended" | "binding_unverified" | "denial_outstanding"
  | "capability_snapshot_missing" | "capability_snapshot_stale" | "capability_readback_missing"
  | "limit_policy_missing" | "limit_readback_missing" | "meter_semantics_unverified";

export interface ActivationReadiness {
  /** Advisory only. No caller may treat this result as an access token or provider grant. */
  ready: false;
  reasons: ActivationReadinessReason[];
  /** Present only when this mapping belongs to the requested organization and instance. */
  subject: { membershipId: string; productInstanceId: string } | null;
  evidence: {
    capabilityRevision: number | null;
    checkedLimitCount: number;
    declaredMeterCount: number;
  };
}

type Mapping = {
  desired_enabled: boolean; policy_blocked: boolean; provisioning_status: string;
  desired_revision: number; external_member_id: string | null; access_revision: string;
  provider_receipt_reference: string | null; provisioned_at: Date | null;
  membership_id: string; product_instance_id: string; member_status: string; user_status: string;
  organization_status: string; role_id: string; instance_enabled: boolean; instance_status: string;
  external_organization_id: string | null; mode: string; catalog_status: string; catalog_metadata: unknown;
};

type Limit = {
  id: string; membership_id: string | null; meter_key: string; unit: string; window_key: string;
  revision: number | null; maximum_quantity: string | null; status: string | null; attempt_count: number | null;
  outcome: string | null; finished_at: Date | null; apply_receipt: unknown; readback_receipt: unknown;
  claimed_access_revision: string | null;
};

/**
 * A tenant-scoped diagnostic for the eventual activation worker. The current
 * catalog lists meter keys but does not define authoritative meter coverage,
 * unit/window semantics or runtime enforcement. Consequently this function
 * deliberately never returns ready, even when all stored receipts match.
 */
export async function inspectMemberActivationReadiness(url: string, input: {
  actorUserId: string; organizationId: string; productMembershipId: string; expectedProductInstanceId: string;
}): Promise<ActivationReadiness> {
  const actorUserId = UserIdSchema.parse(input.actorUserId);
  const organizationId = OrganizationIdSchema.parse(input.organizationId);
  const productMembershipId = ProductMembershipIdSchema.parse(input.productMembershipId);
  const expectedProductInstanceId = ProductInstanceIdSchema.parse(input.expectedProductInstanceId);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await setServiceContext(client, actorUserId, organizationId);
    const permission = await client.query<{ allowed: boolean }>(`SELECT
      company_human_private.has_capability($1,'applications.manage')
      AND company_human_private.has_capability($1,'budgets.manage') AS allowed`, [organizationId]);
    if (permission.rows[0]?.allowed !== true) throw new Error("Activation diagnostic denied");

    const reasons = new Set<ActivationReadinessReason>();
    const evidence = { capabilityRevision: null as number | null, checkedLimitCount: 0, declaredMeterCount: 0 };
    let subject: ActivationReadiness["subject"] = null;
    const result = (): ActivationReadiness => ({ ready: false, reasons: [...reasons], subject, evidence });
    const mapping = (await client.query<Mapping>(`SELECT pm.desired_enabled,pm.policy_blocked,pm.provisioning_status,
      pm.desired_revision,pm.external_member_id,pm.access_revision,pm.provider_receipt_reference,pm.provisioned_at,
      pm.membership_id,pm.product_instance_id,
      m.status AS member_status,u.status AS user_status,o.status AS organization_status,m.role_id,
      i.desired_enabled AS instance_enabled,i.provisioning_status AS instance_status,
      i.external_organization_id,i.mode,p.catalog_status,p.catalog_metadata
      FROM public.product_memberships pm
      JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
      JOIN public.users u ON u.id=m.user_id JOIN public.organizations o ON o.id=pm.organization_id
      JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
      JOIN public.products p ON p.id=i.product_id
      WHERE pm.organization_id=$1 AND pm.id=$2 AND pm.product_instance_id=$3`,
      [organizationId, productMembershipId, expectedProductInstanceId])).rows[0];
    if (!mapping) { reasons.add("membership_unavailable"); reasons.add("meter_semantics_unverified"); await client.query("COMMIT"); return result(); }
    subject = { membershipId: mapping.membership_id, productInstanceId: mapping.product_instance_id };
    if (mapping.member_status !== "active" || mapping.user_status !== "active" || mapping.organization_status !== "active") reasons.add("identity_inactive");
    const catalog = ProductCatalogMetadataV1Schema.safeParse(mapping.catalog_metadata);
    if (!catalog.success || mapping.catalog_status !== "ready" || !mapping.instance_enabled || mapping.instance_status !== "active"
      || !mapping.external_organization_id || !catalog.data.provisioningModes.includes(mapping.mode as typeof catalog.data.provisioningModes[number])
      || !catalog.data.supportedMemberOperations.includes("provision")) reasons.add("product_unavailable");
    if (!mapping.desired_enabled || mapping.policy_blocked || mapping.provisioning_status !== "suspended" || !mapping.external_member_id)
      reasons.add("mapping_not_suspended");

    const required = catalog.success ? [...new Set(["product.use", ...catalog.data.requiredPermissions])] : ["product.use"];
    const grants = (await client.query<{ permission_key: string }>(`SELECT permission_key FROM public.role_permissions
      WHERE organization_id=$1 AND role_id=$2 AND permission_key=ANY($3::text[])`, [organizationId, mapping.role_id, required])).rows;
    if (!catalog.success || grants.length !== required.length) reasons.add("role_not_authorized");

    // The mapped external identifier alone is not evidence of a successful
    // suspended bootstrap. The receipt must belong to this mapping's command.
    const bootstrap = await client.query<{ command_id: string }>(`SELECT c.id AS command_id FROM public.product_membership_commands c
      JOIN public.product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
      JOIN public.member_bootstrap_jobs j ON j.organization_id=c.organization_id AND j.command_id=c.id
      JOIN public.member_bootstrap_attempts a ON a.organization_id=j.organization_id AND a.command_id=j.command_id
        AND a.attempt_number=j.attempt_count
      WHERE c.organization_id=$1 AND c.product_membership_id=$2 AND c.operation='provisionMember'
        AND j.status='succeeded' AND a.outcome='succeeded' AND a.finished_at IS NOT NULL
        AND j.provider_reference=$3 AND a.provider_reference=$3
        AND pm.provider_receipt_reference=c.id||':attempt:'||j.attempt_count
        AND pm.provisioned_at=a.finished_at LIMIT 1`,
    [organizationId, productMembershipId, mapping.external_member_id]);
    if (!bootstrap.rowCount) reasons.add("binding_unverified");
    // A policy edit can enqueue a fenced denial. Historical failures are not
    // enough to block a newer reconciled fence, but the current revision must
    // have an exact suspended provider readback before any future activation.
    if (Number(mapping.access_revision) > 0) {
      const denied = await client.query(`SELECT 1 FROM public.product_membership_commands c
        JOIN public.member_denial_jobs j ON j.organization_id=c.organization_id AND j.command_id=c.id
        JOIN public.member_denial_attempts a ON a.organization_id=j.organization_id AND a.command_id=j.command_id
          AND a.attempt_number=j.attempt_count
        JOIN public.member_denial_access_receipts r ON r.organization_id=a.organization_id
          AND r.command_id=a.command_id AND r.attempt_number=a.attempt_number
        WHERE c.organization_id=$1 AND c.product_membership_id=$2 AND c.operation='suspendMember'
          AND c.desired_revision=$3 AND j.status='succeeded' AND a.outcome='succeeded'
          AND a.finished_at IS NOT NULL AND a.provider_reference=$4
          AND r.receipt=jsonb_build_object('schemaVersion',1,'organizationId',$1::text,
            'productInstanceId',$5::text,'membershipId',$6::text,
            'target',jsonb_build_object('externalOrganizationId',$7::text,'externalMemberId',$4::text),
            'accessRevision',$8::bigint,'idempotencyKey',c.idempotency_key,
            'access','suspended','policy',NULL) LIMIT 1`,
      [organizationId, productMembershipId, mapping.desired_revision, mapping.external_member_id,
        mapping.product_instance_id, mapping.membership_id, mapping.external_organization_id, mapping.access_revision]);
      if (!denied.rowCount) reasons.add("denial_outstanding");
    }

    const current = await readCurrentCapabilityInputs(client, organizationId, productMembershipId);
    const snapshot = (await client.query<{ policy_revision: number; source: unknown; payload: unknown; status: string | null;
      attempt_count: number | null; outcome: string | null; finished_at: Date | null; apply_receipt: unknown; readback_receipt: unknown }>(
      `SELECT s.policy_revision,s.source,s.payload,j.status,j.attempt_count,a.outcome,a.finished_at,a.apply_receipt,a.readback_receipt
       FROM public.member_capability_snapshots s LEFT JOIN public.capability_jobs j
         ON j.organization_id=s.organization_id AND j.product_membership_id=s.product_membership_id AND j.revision=s.policy_revision
       LEFT JOIN public.capability_attempts a ON a.organization_id=j.organization_id
         AND a.product_membership_id=j.product_membership_id AND a.revision=j.revision AND a.attempt_number=j.attempt_count
       WHERE s.organization_id=$1 AND s.product_membership_id=$2 ORDER BY s.policy_revision DESC LIMIT 1`,
      [organizationId, productMembershipId])).rows[0];
    if (!snapshot) reasons.add("capability_snapshot_missing");
    else {
      evidence.capabilityRevision = snapshot.policy_revision;
      const expected = current && StagedCapabilitiesStateSchema.safeParse({ ...current.state, policyRevision: snapshot.policy_revision });
      const matches = expected && expected.success && matchesStagedCapabilities(expected.data, snapshot.payload);
      // JSONB object key order is not a policy signal; let SQL compare source.
      const sourceMatch = current && (await client.query<{ same: boolean }>(`SELECT source=$3::jsonb AS same
        FROM public.member_capability_snapshots WHERE organization_id=$1 AND product_membership_id=$2 AND policy_revision=$4`,
        [organizationId, productMembershipId, current.source, snapshot.policy_revision])).rows[0]?.same === true;
      if (!matches || !sourceMatch) reasons.add("capability_snapshot_stale");
      const apply = CapabilityAdapterResultSchema.safeParse(snapshot.apply_receipt);
      const readback = CapabilityAdapterResultSchema.safeParse(snapshot.readback_receipt);
      if (snapshot.status !== "succeeded" || snapshot.outcome !== "succeeded" || !snapshot.finished_at
        || !apply.success || apply.data.status !== "succeeded" || !readback.success || readback.data.status !== "succeeded"
        || !matchesStagedCapabilities(snapshot.payload, apply.data.value)
        || !matchesStagedCapabilities(snapshot.payload, readback.data.value)) reasons.add("capability_readback_missing");
    }

    const limits = (await client.query<Limit>(`SELECT l.id,l.membership_id,l.meter_key,l.unit,l.window_key,r.revision,r.maximum_quantity,
      j.status,j.attempt_count,a.outcome,a.finished_at,a.apply_receipt,a.readback_receipt,a.claimed_access_revision
      FROM public.product_usage_limits l
      LEFT JOIN LATERAL (SELECT revision,maximum_quantity FROM public.product_usage_limit_revisions
        WHERE organization_id=l.organization_id AND usage_limit_id=l.id ORDER BY revision DESC LIMIT 1) r ON true
      LEFT JOIN public.usage_limit_jobs j ON j.organization_id=l.organization_id AND j.usage_limit_id=l.id AND j.revision=r.revision
      LEFT JOIN public.usage_limit_attempts a ON a.organization_id=j.organization_id AND a.usage_limit_id=j.usage_limit_id
        AND a.revision=j.revision AND a.attempt_number=j.attempt_count
      WHERE l.organization_id=$1 AND l.product_instance_id=$2 AND (l.membership_id IS NULL OR l.membership_id=$3)`,
      [organizationId, mapping.product_instance_id, mapping.membership_id])).rows;
    evidence.declaredMeterCount = catalog.success ? catalog.data.usageMeters.length : 0;
    evidence.checkedLimitCount = limits.length;
    for (const meter of catalog.success ? catalog.data.usageMeters : []) {
      if (!limits.some(limit => limit.meter_key === meter && limit.membership_id === null)) reasons.add("limit_policy_missing");
    }
    for (const limit of limits) {
      if (limit.revision === null || limit.maximum_quantity === null) {
        reasons.add("limit_policy_missing");
        continue;
      }
      if (catalog.success && !catalog.data.usageMeters.includes(limit.meter_key)) { reasons.add("limit_policy_missing"); continue; }
      const state = AppliedUsageLimitStateSchema.safeParse({ schemaVersion: 1,
        limit: { schemaVersion: 1, usageLimitId: limit.id, organizationId, productInstanceId: mapping.product_instance_id,
          membershipId: limit.membership_id, meterKey: limit.meter_key, unit: limit.unit, window: limit.window_key,
          revision: limit.revision, maximumQuantity: limit.maximum_quantity },
        target: { externalOrganizationId: mapping.external_organization_id,
          externalMemberId: limit.membership_id === null ? null : mapping.external_member_id },
        enforcement: "hard_stop", accounting: "preserve_accumulated_usage",
        scope: limit.membership_id === null ? "organization_aggregate" : "member" });
      const apply = UsageLimitAdapterResultSchema.safeParse(limit.apply_receipt);
      const readback = UsageLimitAdapterResultSchema.safeParse(limit.readback_receipt);
      if (!state.success || limit.status !== "succeeded" || limit.outcome !== "succeeded" || !limit.finished_at
        || (limit.membership_id !== null && Number(limit.maximum_quantity) > 0
          && limit.claimed_access_revision !== mapping.access_revision)
        || !apply.success || apply.data.status !== "succeeded" || !readback.success || readback.data.status !== "succeeded"
        || !matchesAppliedUsageLimit(state.success ? state.data : null, apply.success && apply.data.status === "succeeded" ? apply.data.value : null)
        || !matchesAppliedUsageLimit(state.success ? state.data : null, readback.success && readback.data.status === "succeeded" ? readback.data.value : null))
        reasons.add("limit_readback_missing");
    }
    // No versioned definition of all expensive meters, units, windows, and
    // provider-side hard-stop guarantees exists yet. A key list is insufficient.
    reasons.add("meter_semantics_unverified");
    await client.query("COMMIT");
    return result();
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}
