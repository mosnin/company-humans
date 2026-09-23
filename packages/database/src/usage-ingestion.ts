import type { Client } from "pg";
import { SignedUsageEventV1Schema } from "@company-human/contracts";
import { verifyEventEnvelope } from "@company-human/contracts/signing";

export interface UsageSigningAuthority {
  keyId: string; key: Uint8Array; organizationId: string; productId: string;
  productInstanceId: string; environment: "test" | "production"; sourceSystem: string;
}
/** A signed event named a team whose historical assignment cannot be proven. */
export class InvalidUsageTeamAttributionError extends Error {
  constructor() { super("Usage team attribution invalid"); this.name = "InvalidUsageTeamAttributionError"; }
}
const isTemporalTeamError = (error: unknown) => {
  const detail = error as { code?: unknown; constraint?: unknown };
  return detail?.code === "CHT01" && detail.constraint === "usage_team_temporal";
};
type StoredUsage = { event_id: string; disposition: "accepted" | "quarantined"; identical: boolean };
async function findExistingUsage(client: Client, body: object, eventId: string, sourceSystem: string, sourceEventId: string, idempotencyKey: string) {
  const existing = await client.query<StoredUsage>(`SELECT event_id,disposition,envelope=$1::jsonb AS identical FROM public.usage_events
    WHERE event_id=$2 OR (source_system=$3 AND source_event_id=$4) OR idempotency_key=$5`,
  [JSON.stringify(body),eventId,sourceSystem,sourceEventId,idempotencyKey]);
  if (existing.rows.length === 0) return null;
  if (existing.rows.length !== 1 || !existing.rows[0]!.identical) throw new Error("Usage idempotency conflict");
  return { eventId: existing.rows[0]!.event_id, disposition: existing.rows[0]!.disposition, duplicate: true as const };
}
/** Caller supplies a server-resolved, unrevoked signing authority, never request fields.
 * Requires an open transaction and restricted usage-ingest connection.
 */
export async function ingestUsageEvent(client: Client, input: unknown, authority: UsageSigningAuthority): Promise<{ eventId: string; disposition: "accepted" | "quarantined"; duplicate: boolean }> {
  const verified = verifyEventEnvelope(input, id => id === authority.keyId ? authority.key : undefined);
  const event = SignedUsageEventV1Schema.parse(verified);
  if (event.organizationId !== authority.organizationId || event.productId !== authority.productId
    || event.payload.productInstanceId !== authority.productInstanceId || event.environment !== authority.environment
    || event.source.system !== authority.sourceSystem) throw new Error("Usage signing scope denied");
  const { signature, ...body } = verified;
  const p = event.payload;
  const duplicateArgs = [client,body,event.eventId,event.source.system,event.source.eventId,event.idempotencyKey] as const;
  const role = await client.query<{ allowed: boolean }>(`SELECT pg_has_role(current_user,'company_human_usage_ingest','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.usage_events'::regclass),'member') AS allowed FROM pg_roles r WHERE rolname=current_user`);
  if (!role.rows[0]?.allowed) throw new Error("Usage ingestion requires a restricted role");
  await client.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.product_instance_id',$2,true),set_config('company_human.integration_environment',$3,true)", [authority.organizationId,authority.productInstanceId,authority.environment]);
  await client.query("SAVEPOINT usage_ingestion");
  try {
    // BEFORE INSERT checks run even with ON CONFLICT DO NOTHING. Return an
    // authenticated exact retry before rechecking a now-ended team interval.
    const prior = await findExistingUsage(...duplicateArgs);
    if (prior) { await client.query("RELEASE SAVEPOINT usage_ingestion"); return prior; }
    const meter = await client.query("SELECT 1 FROM public.meter_definitions WHERE product_id=$1 AND meter_key=$2 AND version=$3 AND unit=$4", [event.productId,p.meterKey,p.meterVersion,p.unit]);
    const disposition = meter.rowCount === 1 ? "accepted" : "quarantined";
    // The database binds human actor user IDs to the attributed historical membership.
    // Do not require active membership: delayed consumption remains accountable after removal.
    const inserted = await client.query(`INSERT INTO public.usage_events
      (event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,idempotency_key,membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,disposition,envelope,signature)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT DO NOTHING RETURNING event_id`,
      [event.eventId,event.organizationId,event.productId,p.productInstanceId,event.environment,event.source.system,event.source.eventId,event.idempotencyKey,p.membershipId,p.teamId,p.meterKey,p.meterVersion,p.quantity,p.unit,event.occurredAt,event.reportedAt,disposition,JSON.stringify(body),JSON.stringify(signature)]);
    if (inserted.rowCount === 1) { await client.query("RELEASE SAVEPOINT usage_ingestion"); return { eventId: event.eventId, disposition, duplicate: false }; }
    const existing = await findExistingUsage(...duplicateArgs);
    if (!existing) throw new Error("Usage idempotency conflict");
    await client.query("RELEASE SAVEPOINT usage_ingestion");
    return existing;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT usage_ingestion");
    await client.query("RELEASE SAVEPOINT usage_ingestion");
    if (isTemporalTeamError(error)) {
      const concurrentDuplicate = await findExistingUsage(...duplicateArgs);
      if (concurrentDuplicate) return concurrentDuplicate;
      throw new InvalidUsageTeamAttributionError();
    }
    throw error;
  }
}

/** Dedicated server connection; no table-owner fallback. */
export async function storeSignedUsage(databaseUrl: string, input: unknown, authority: UsageSigningAuthority) {
  const { Client: PgClient } = await import("pg");
  const client = new PgClient({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await ingestUsageEvent(client,input,authority);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}
