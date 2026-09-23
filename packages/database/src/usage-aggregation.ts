import { Client } from "pg";
import { OrganizationIdSchema, UserIdSchema, ProductInstanceIdSchema, MembershipIdSchema, TeamIdSchema, ProductCapabilityKeySchema } from "@company-human/contracts";

export interface UsageWindow {
  organizationId: string;
  environment: "test" | "production";
  /** Half-open occurrence interval [from, until), ISO timestamps with an explicit timezone. */
  from: string;
  until: string;
  breakdown: "organization" | "product" | "instance" | "team" | "member" | "capability";
  productInstanceId?: string;
  membershipId?: string;
  teamId?: string;
  capabilityKey?: string;
}
export interface UsageAggregate {
  organizationId: string;
  productId: string;
  productName: string;
  meterName: string;
  productInstanceId: string | null;
  membershipId: string | null;
  teamId: string | null;
  capabilityKey: string | null;
  environment: "test" | "production";
  meterKey: string;
  meterVersion: number;
  unit: string;
  aggregation: "sum" | "maximum" | "last";
  /** Exact PostgreSQL numeric text; never coerce billing quantities to a JS float. */
  quantity: string;
  eventCount: string;
}
function validateWindow(window: UsageWindow) {
  OrganizationIdSchema.parse(window.organizationId);
  if (window.productInstanceId !== undefined) ProductInstanceIdSchema.parse(window.productInstanceId);
  if (window.membershipId !== undefined) MembershipIdSchema.parse(window.membershipId);
  if (window.teamId !== undefined) TeamIdSchema.parse(window.teamId);
  if (window.capabilityKey !== undefined) ProductCapabilityKeySchema.parse(window.capabilityKey);
  if (window.capabilityKey !== undefined && window.breakdown !== "capability") {
    throw new Error("Capability filter requires capability breakdown");
  }
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (![window.from,window.until].every(value => timestamp.test(value) && Number.isFinite(Date.parse(value)))
    || Date.parse(window.from) >= Date.parse(window.until)) throw new Error("Invalid usage window");
  if (!["test","production"].includes(window.environment)
    || !["organization","product","instance","team","member","capability"].includes(window.breakdown)) throw new Error("Invalid usage scope");
}

/** Requires a caller-owned transaction. RLS permits only the verified user's own,
 * managed-team, or organization-wide usage. Organization/product totals preserve
 * product+meter-version+unit boundaries: unlike units and gauges cannot be added.
 * Null attribution remains its own bucket. Late events appear on the next read.
 */
export async function aggregateUsageInTransaction(client: Client, userId: string, window: UsageWindow): Promise<UsageAggregate[]> {
  UserIdSchema.parse(userId); validateWindow(window);
  const role = await client.query<{allowed:boolean}>(`SELECT pg_has_role(current_user,'company_human_app','member')
    AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.usage_events'::regclass),'member') AS allowed
    FROM pg_roles r WHERE rolname=current_user`);
  if (!role.rows[0]?.allowed) throw new Error("Usage aggregation requires a restricted reader role");
  await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",[userId,window.organizationId]);
  const result = await client.query<UsageAggregate>(`WITH scoped AS (
    SELECT e.product_id,p.display_name AS product_name,m.display_name AS meter_name,e.meter_key,e.meter_version,e.unit,m.aggregation,e.quantity,e.occurred_at,e.reported_at,e.event_id,
      CASE WHEN $5='instance' THEN e.product_instance_id END AS instance_id,
      CASE WHEN $5='member' THEN e.membership_id END AS member_id,
      CASE WHEN $5='team' THEN e.team_id END AS attributed_team_id,
      CASE WHEN $5='capability' THEN e.capability_key END AS attributed_capability_key
    FROM public.usage_events e JOIN public.meter_definitions m
      ON m.product_id=e.product_id AND m.meter_key=e.meter_key AND m.version=e.meter_version AND m.unit=e.unit
    JOIN public.products p ON p.id=e.product_id
    WHERE e.organization_id=$1 AND e.environment=$2 AND e.occurred_at >= $3::timestamptz AND e.occurred_at < $4::timestamptz
      AND (e.disposition='accepted' OR EXISTS(SELECT 1 FROM public.usage_quarantine_releases r WHERE r.event_id=e.event_id AND r.organization_id=e.organization_id)) AND ($6::text IS NULL OR e.product_instance_id=$6)
      AND ($7::text IS NULL OR e.membership_id=$7) AND ($8::text IS NULL OR e.team_id=$8)
      AND ($9::text IS NULL OR e.capability_key=$9)
  ), ranked AS (
    SELECT *,row_number() OVER (PARTITION BY product_id,meter_key,meter_version,unit,instance_id,member_id,attributed_team_id,attributed_capability_key
      ORDER BY occurred_at DESC,reported_at DESC,event_id DESC) AS position FROM scoped
  ) SELECT $1::text AS "organizationId",product_id AS "productId",product_name AS "productName",meter_name AS "meterName",instance_id AS "productInstanceId",
    member_id AS "membershipId",attributed_team_id AS "teamId",attributed_capability_key AS "capabilityKey",$2::text AS environment,
    meter_key AS "meterKey",meter_version AS "meterVersion",unit,aggregation,
    (CASE aggregation WHEN 'sum' THEN sum(quantity) WHEN 'maximum' THEN max(quantity)
      WHEN 'last' THEN max(quantity) FILTER (WHERE position=1) END)::text AS quantity,count(*)::text AS "eventCount"
    FROM ranked GROUP BY product_id,product_name,meter_name,meter_key,meter_version,unit,aggregation,instance_id,member_id,attributed_team_id,attributed_capability_key
    ORDER BY product_id,meter_key,meter_version,unit,instance_id NULLS FIRST,member_id NULLS FIRST,attributed_team_id NULLS FIRST,attributed_capability_key NULLS FIRST`,
  [window.organizationId,window.environment,window.from,window.until,window.breakdown,window.productInstanceId??null,window.membershipId??null,window.teamId??null,window.capabilityKey??null]);
  return result.rows;
}
export async function aggregateUsage(databaseUrl: string, userId: string, window: UsageWindow): Promise<UsageAggregate[]> {
  UserIdSchema.parse(userId); validateWindow(window);
  const client = new Client({connectionString:databaseUrl,connectionTimeoutMillis:5000,statement_timeout:10000});
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result=await aggregateUsageInTransaction(client,userId,window);
    await client.query("COMMIT"); return result;
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}
