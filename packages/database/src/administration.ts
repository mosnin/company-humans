import { OrganizationIdSchema, UserIdSchema, type Capability } from "@company-human/contracts";
import { Client } from "pg";
import { setServiceContext } from "./service-context.js";

export class AdministrationDenied extends Error {
  constructor() { super("Organization administration denied"); }
}

async function readAdministration<T>(databaseUrl: string, actorUserId: string, organizationId: string, capabilities: Capability[], read: (client: Client) => Promise<T>): Promise<T> {
  UserIdSchema.parse(actorUserId); OrganizationIdSchema.parse(organizationId);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, actorUserId, organizationId);
    const permitted = await client.query("SELECT 1 FROM unnest($2::text[]) capability WHERE company_human_private.has_capability($1,capability) LIMIT 1", [organizationId, capabilities]);
    if (!permitted.rowCount) throw new AdministrationDenied();
    const result = await read(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}

export interface PersonSummary { id: string; userId: string; name: string; email: string | null; roleKey: string; status: string }
export async function listPeople(databaseUrl: string, actorUserId: string, organizationId: string, search = "", page = 1) {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  const query = search.trim().slice(0, 128);
  return readAdministration(databaseUrl, actorUserId, organizationId, ["members.manage"], async client => {
    const filter = `FROM public.memberships m JOIN public.users u ON u.id = m.user_id
      WHERE m.organization_id = $1 AND (u.display_name ILIKE $2 OR u.primary_email ILIKE $2)`;
    const values = [organizationId, `%${query}%`];
    const count = await client.query<{ total: string }>(`SELECT count(*) AS total ${filter}`, values);
    const rows = await client.query<PersonSummary>(`SELECT m.id, m.user_id AS "userId", u.display_name AS name,
      u.primary_email AS email, m.role_key AS "roleKey", m.status ${filter} ORDER BY u.display_name, m.id LIMIT 50 OFFSET $3`, [...values, (currentPage - 1) * 50]);
    return { people: rows.rows, total: Number(count.rows[0]!.total), page: currentPage };
  });
}

export interface TeamSummary { id: string; name: string; memberCount: number; members: { name: string; role: string }[] }
export async function listTeams(databaseUrl: string, actorUserId: string, organizationId: string) {
  return readAdministration(databaseUrl, actorUserId, organizationId, ["teams.create", "teams.manage.all"], async client => {
    const teams = await client.query<TeamSummary>(`SELECT t.id,t.name,count(m.id)::integer AS "memberCount",
      COALESCE(jsonb_agg(jsonb_build_object('name',u.display_name,'role',tm.team_role) ORDER BY u.display_name) FILTER (WHERE m.id IS NOT NULL),'[]') AS members
      FROM public.teams t LEFT JOIN public.team_memberships tm ON tm.team_id = t.id AND tm.organization_id = t.organization_id AND tm.ended_at IS NULL
      LEFT JOIN public.memberships m ON m.id = tm.membership_id AND m.organization_id = t.organization_id AND m.status = 'active'
      LEFT JOIN public.users u ON u.id = m.user_id
      WHERE t.organization_id = $1 AND t.status = 'active' GROUP BY t.id ORDER BY t.name LIMIT 200`, [organizationId]);
    return teams.rows;
  });
}
export interface RolePolicy { id: string; key: string; capabilities: Capability[] }
export async function listRolePolicies(databaseUrl: string, actorUserId: string, organizationId: string) {
  return readAdministration(databaseUrl, actorUserId, organizationId, ["roles.manage"], async client => {
    return (await client.query<RolePolicy>(`SELECT r.id,r.key,
      COALESCE(array_agg(p.permission_key ORDER BY p.permission_key) FILTER (WHERE p.permission_key IS NOT NULL),'{}') AS capabilities
      FROM public.roles r LEFT JOIN public.role_permissions p ON p.role_id = r.id AND p.organization_id = r.organization_id
      WHERE r.organization_id = $1 GROUP BY r.id ORDER BY r.key`, [organizationId])).rows;
  });
}

export interface AuditSummary {
  id: string; action: string; actorName: string; actorUserId: string; targetType: string; targetId: string;
  occurredAt: Date; beforeState: Record<string,unknown> | null; afterState: Record<string,unknown> | null;
}
export async function listAuditEvents(databaseUrl: string, actorUserId: string, organizationId: string, page = 1) {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  return readAdministration(databaseUrl, actorUserId, organizationId, ["audit.read.all"], async client => {
    const count = await client.query<{ total: string }>("SELECT count(*) AS total FROM public.identity_audit_events WHERE organization_id = $1", [organizationId]);
    const events = await client.query<AuditSummary>(`SELECT a.id,a.action,COALESCE(u.display_name,'Unknown actor') AS "actorName",
      a.actor_user_id AS "actorUserId",a.target_type AS "targetType",a.target_id AS "targetId",a.occurred_at AS "occurredAt",
      a.before_state AS "beforeState",a.after_state AS "afterState"
      FROM public.identity_audit_events a LEFT JOIN public.users u ON u.id = a.actor_user_id
      WHERE a.organization_id = $1 ORDER BY a.occurred_at DESC,a.id DESC LIMIT 50 OFFSET $2`, [organizationId,(currentPage-1)*50]);
    return { events: events.rows,total:Number(count.rows[0]!.total),page:currentPage };
  });
}

export interface ApplicationDiagnostic {
  id: string; productName: string; instanceKey: string; mode: string; desiredEnabled: boolean; provisioningStatus: string;
  operation: null | { status: string; attemptCount: number; failureCode: string | null; nextAttemptAt: string;
    attempts: { number: number; startedAt: string; finishedAt: string | null; outcome: string | null; failureCode: string | null }[] };
}
/** Explicit projection excludes lease credentials, provider references and raw payloads. */
export async function listApplicationDiagnostics(databaseUrl: string, actorUserId: string, organizationId: string, page = 1) {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  return readAdministration(databaseUrl, actorUserId, organizationId, ["applications.manage"], async client => {
    const count = await client.query<{ total: string }>("SELECT count(*) AS total FROM public.product_instances WHERE organization_id = $1", [organizationId]);
    const records = await client.query<ApplicationDiagnostic>(`SELECT i.id,p.display_name AS "productName",i.instance_key AS "instanceKey",
      i.mode,i.desired_enabled AS "desiredEnabled",i.provisioning_status AS "provisioningStatus",
      CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('status',o.status,'attemptCount',o.attempt_count,
        'failureCode',o.failure_code,'nextAttemptAt',o.next_attempt_at,'attempts',COALESCE((
          SELECT jsonb_agg(jsonb_build_object('number',a.attempt_number,'startedAt',a.started_at,'finishedAt',a.finished_at,
            'outcome',a.outcome,'failureCode',a.failure_code) ORDER BY a.attempt_number)
          FROM public.provisioning_attempts a WHERE a.organization_id = i.organization_id AND a.operation_id = o.id),'[]'::jsonb)) END AS operation
      FROM public.product_instances i JOIN public.products p ON p.id = i.product_id
      LEFT JOIN public.provisioning_operations o ON o.organization_id = i.organization_id AND o.product_instance_id = i.id
      WHERE i.organization_id = $1 ORDER BY p.display_name,i.instance_key,i.id LIMIT 50 OFFSET $2`, [organizationId, (currentPage - 1) * 50]);
    return { applications: records.rows, total: Number(count.rows[0]!.total), page: currentPage };
  });
}
