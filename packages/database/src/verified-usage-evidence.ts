import { Client } from "pg";
import {
  EventIdSchema, OrganizationIdSchema, ProductIdSchema, ProductInstanceIdSchema,
  SignedUsageEventV1Schema, UserIdSchema, LimitQuantitySchema,
} from "@company-human/contracts";
import { verifyEventEnvelope } from "@company-human/contracts/signing";
import type { UsageSigningAuthority } from "./usage-ingestion.js";

/** The caller must resolve key availability and revocation from its trusted
 * key registry. Historical key material is valid only while this status is
 * active for verification under that registry's policy.
 */
export interface UsageVerificationAuthority extends UsageSigningAuthority {
  status: "active" | "revoked";
}

type StoredUsageRow = {
  event_id: string; organization_id: string; product_id: string; product_instance_id: string;
  environment: string; source_system: string; source_event_id: string; source_operation_id: string | null;
  idempotency_key: string; membership_id: string | null; team_id: string | null; actor_user_id: string | null;
  capability_key: string | null; meter_key: string; meter_version: number; quantity: string; unit: string;
  occurred_at: string; reported_at: string;
  disposition: string; envelope: unknown; signature: unknown; released: boolean;
  exact_sum_meter_registered: boolean;
};

function utcMicroseconds(value: string): string {
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
  if (fraction.length > 6 && /[1-9]/.test(fraction.slice(6)))
    throw new Error("Timestamp exceeds stored microsecond precision");
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error("Invalid signed timestamp");
  const utc = new Date(millis).toISOString();
  return `${utc.slice(0, 19)}.${utc.slice(20, 23)}${fraction.padEnd(6, "0").slice(3, 6)}Z`;
}

export interface VerifiedUsageEvidenceV1 {
  schemaVersion: 1;
  eventId: string; organizationId: string; productId: string; productInstanceId: string;
  environment: "test" | "production"; membershipId: string | null; teamId: string | null;
  capabilityKey: string | null; meter: { meterKey: string; meterVersion: number; unit: string };
  actualQuantity: string; source: { system: string; operationId: string };
  sourceEventId: string; occurredAt: string; reportedAt: string;
  ingestionDisposition: "accepted" | "released";
  signatureKeyId: string;
  signatureVerified: true;
  authorizesUsage: false;
  providerEnforcementConfirmed: false;
  eligibleForSettlement: false;
  quarantineReleaseAuthorizationVerified: false;
}

export class StoredUsageVerificationError extends Error {
  constructor(message = "Stored usage event cannot be verified") {
    super(message);
    this.name = "StoredUsageVerificationError";
  }
}

/** Caller provides a currently trusted, unrevoked authority selected outside the
 * database. This checks one immutable row against its signed source body; it is
 * evidence only and must never be treated as a reservation or provider grant.
 */
export function verifyStoredUsageRow(row: StoredUsageRow, authority: UsageVerificationAuthority): VerifiedUsageEvidenceV1 {
  try {
    if (!authority || authority.status !== "active") throw new Error("Signing authority unavailable or revoked");
    if (!row || typeof row.envelope !== "object" || row.envelope === null || Array.isArray(row.envelope))
      throw new Error("Missing signed body");
    const signed = verifyEventEnvelope({ ...row.envelope, signature: row.signature },
      keyId => keyId === authority.keyId ? authority.key : undefined);
    const event = SignedUsageEventV1Schema.parse(signed);
    const payload = event.payload;
    const sourceOperationId = event.source.operationId;
    if (!sourceOperationId || !row.source_operation_id)
      throw new Error("Source operation identity is required for reservation evidence");
    if (event.organizationId !== authority.organizationId || event.productId !== authority.productId ||
        payload.productInstanceId !== authority.productInstanceId || event.environment !== authority.environment ||
        event.source.system !== authority.sourceSystem)
      throw new Error("Signing authority scope does not match usage");
    const bindings: ReadonlyArray<[unknown, unknown]> = [
      [row.event_id, event.eventId], [row.organization_id, event.organizationId],
      [row.product_id, event.productId], [row.product_instance_id, payload.productInstanceId],
      [row.environment, event.environment], [row.source_system, event.source.system],
      [row.source_event_id, event.source.eventId], [row.source_operation_id, sourceOperationId],
      [row.idempotency_key, event.idempotencyKey], [row.membership_id, payload.membershipId],
      [row.team_id, payload.teamId], [row.capability_key, payload.capabilityKey],
      [row.actor_user_id, event.actor.type === "human" ? event.actor.userId : null],
      [row.meter_key, payload.meterKey], [row.meter_version, payload.meterVersion],
      [row.unit, payload.unit],
      [row.occurred_at, utcMicroseconds(event.occurredAt)],
      [row.reported_at, utcMicroseconds(event.reportedAt)],
    ];
    if (bindings.some(([stored, verified]) => stored !== verified))
      throw new Error("Stored projection does not match signed body");
    const actualQuantity = LimitQuantitySchema.parse(row.quantity);
    if (actualQuantity !== payload.quantity || actualQuantity === "0")
      throw new Error("Stored quantity does not match positive signed quantity");
    const ingestionDisposition = row.disposition === "accepted" ? "accepted"
      : row.disposition === "quarantined" && row.released === true ? "released" : null;
    if (!ingestionDisposition || (row.disposition === "accepted" && row.released))
      throw new Error("Usage is quarantined without a release or has conflicting disposition");
    if (row.exact_sum_meter_registered !== true)
      throw new Error("Exact sum meter is unavailable");
    return {
      schemaVersion: 1, eventId: event.eventId, organizationId: event.organizationId,
      productId: event.productId, productInstanceId: payload.productInstanceId,
      environment: event.environment, membershipId: payload.membershipId, teamId: payload.teamId,
      capabilityKey: payload.capabilityKey, meter: { meterKey: payload.meterKey,
        meterVersion: payload.meterVersion, unit: payload.unit }, actualQuantity,
      source: { system: event.source.system, operationId: sourceOperationId },
      sourceEventId: event.source.eventId, occurredAt: event.occurredAt, reportedAt: event.reportedAt,
      ingestionDisposition, signatureKeyId: signed.signature.keyId, signatureVerified: true,
      authorizesUsage: false, providerEnforcementConfirmed: false,
      eligibleForSettlement: false, quarantineReleaseAuthorizationVerified: false,
    };
  } catch (error) {
    throw new StoredUsageVerificationError(
      `Stored usage event cannot be verified: ${error instanceof Error ? error.message : "invalid input"}`,
    );
  }
}

/** Reads one event under existing revalidator RLS. The login may have other
 * privileges outside this transaction; this function grants none and runs in
 * an explicitly read-only transaction. It does not verify provider execution.
 */
export async function readVerifiedUsageEvidence(
  databaseUrl: string,
  input: { eventId: string; actorUserId: string },
  authority: UsageVerificationAuthority,
): Promise<VerifiedUsageEvidenceV1> {
  if (!authority || authority.status !== "active")
    throw new StoredUsageVerificationError("Signing authority unavailable or revoked");
  const eventId = EventIdSchema.parse(input.eventId);
  const actorUserId = UserIdSchema.parse(input.actorUserId);
  const organizationId = OrganizationIdSchema.parse(authority.organizationId);
  ProductIdSchema.parse(authority.productId);
  ProductInstanceIdSchema.parse(authority.productInstanceId);
  if (authority.environment !== "test" && authority.environment !== "production")
    throw new StoredUsageVerificationError("Invalid authority environment");
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL ROLE company_human_usage_revalidator");
    const role = await client.query<{ allowed: boolean }>(`SELECT
      current_user = 'company_human_usage_revalidator'
      AND current_setting('transaction_read_only') = 'on'
      AND current_setting('transaction_isolation') = 'repeatable read'
      AND NOT cr.rolsuper AND NOT cr.rolbypassrls
      AND NOT sr.rolsuper AND NOT sr.rolbypassrls
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.usage_events'::regclass),'member')
      AND NOT pg_has_role(session_user,(SELECT relowner FROM pg_class WHERE oid='public.usage_events'::regclass),'member')
      AS allowed FROM pg_roles cr JOIN pg_roles sr ON sr.rolname=session_user WHERE cr.rolname=current_user`);
    if (role.rows[0]?.allowed !== true) throw new StoredUsageVerificationError("Restricted read-only usage connection required");
    await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
      [actorUserId, organizationId]);
    const permission = await client.query<{ allowed: boolean }>(`SELECT
      company_human_private.has_capability($1,'budgets.manage')
      AND company_human_private.has_capability($1,'usage.read.all') AS allowed`, [organizationId]);
    if (permission.rows[0]?.allowed !== true)
      throw new StoredUsageVerificationError("Usage verification permission denied");
    const rows = await client.query<StoredUsageRow>(`SELECT e.event_id,e.organization_id,e.product_id,e.product_instance_id,
      e.environment,e.source_system,e.source_event_id,e.source_operation_id,e.idempotency_key,
      e.membership_id,e.team_id,e.actor_user_id,e.capability_key,e.meter_key,e.meter_version,e.quantity::text AS quantity,
      e.unit,to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
      to_char(e.reported_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS reported_at,
      e.disposition,e.envelope,e.signature,
      EXISTS (SELECT 1 FROM public.usage_quarantine_releases r
        WHERE r.event_id=e.event_id AND r.organization_id=e.organization_id) AS released
      ,EXISTS (SELECT 1 FROM public.meter_definitions m
        WHERE m.product_id=e.product_id AND m.meter_key=e.meter_key AND m.version=e.meter_version
          AND m.unit=e.unit AND m.aggregation='sum') AS exact_sum_meter_registered
      FROM public.usage_events e WHERE e.event_id=$1 AND e.organization_id=$2 AND e.product_id=$3
        AND e.product_instance_id=$4 AND e.environment=$5 AND e.source_system=$6`,
    [eventId, organizationId, authority.productId, authority.productInstanceId,
      authority.environment, authority.sourceSystem]);
    if (rows.rows.length !== 1) throw new StoredUsageVerificationError("Stored usage event unavailable or denied");
    const evidence = verifyStoredUsageRow(rows.rows[0]!, authority);
    await client.query("COMMIT");
    return evidence;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}
