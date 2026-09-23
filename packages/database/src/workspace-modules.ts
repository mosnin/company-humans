import { Client } from "pg";
import { z } from "zod";
import { OrganizationIdSchema, UserIdSchema } from "@company-human/contracts";
import { setServiceContext } from "./service-context.js";

export const WORKSPACE_MODULE_KEYS = [
  "work", "crm", "referrals", "earnings", "leaderboard", "team", "context", "creator",
] as const;
export const WorkspaceModuleKeySchema = z.enum(WORKSPACE_MODULE_KEYS);
export type WorkspaceModuleKey = z.infer<typeof WorkspaceModuleKeySchema>;
export interface WorkspaceModuleSetting {
  moduleKey: WorkspaceModuleKey;
  enabled: boolean;
  /** Zero means no organization-specific revision exists yet. */
  revision: number;
}

const Read = z.object({ actorUserId: UserIdSchema, organizationId: OrganizationIdSchema }).strict();
const Write = Read.extend({
  moduleKey: WorkspaceModuleKeySchema,
  enabled: z.boolean(),
  expectedRevision: z.number().int().nonnegative().max(2147483646),
}).strict();
const DEFAULT_ENABLED: Readonly<Record<WorkspaceModuleKey, boolean>> = {
  work: true, crm: false, referrals: false, earnings: false,
  leaderboard: false, team: false, context: false, creator: false,
};

export class WorkspaceModuleDenied extends Error {
  constructor() { super("Workspace modules unavailable or permission denied"); this.name = "WorkspaceModuleDenied"; }
}
export class WorkspaceModuleConflict extends Error {
  constructor() { super("Workspace module changed. Reload before saving."); this.name = "WorkspaceModuleConflict"; }
}

function isPgCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

type Row = { module_key: string; enabled: boolean; revision: number };

/** All native modules for one active member's organization. This is navigation
 * configuration, not an authorization or connected-product entitlement. */
export async function readWorkspaceModules(
  databaseUrl: string,
  input: z.input<typeof Read>,
): Promise<WorkspaceModuleSetting[]> {
  const parsed = Read.parse(input);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const role = await client.query<{ allowed: boolean }>(`SELECT pg_has_role(current_user,'company_human_app','member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class
        WHERE oid='public.workspace_module_revisions'::regclass),'member') AS allowed
      FROM pg_roles r WHERE rolname=current_user`);
    if (!role.rows[0]?.allowed) throw new WorkspaceModuleDenied();
    await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
      [parsed.actorUserId, parsed.organizationId]);
    const membership = await client.query<{ allowed: boolean }>(
      "SELECT company_human_private.has_active_membership($1) AS allowed", [parsed.organizationId]);
    if (!membership.rows[0]?.allowed) throw new WorkspaceModuleDenied();
    const result = await client.query<Row>(`SELECT DISTINCT ON (module_key) module_key,enabled,revision
      FROM public.workspace_module_revisions WHERE organization_id=$1
      ORDER BY module_key,revision DESC`, [parsed.organizationId]);
    const current = new Map(result.rows.map(row => [WorkspaceModuleKeySchema.parse(row.module_key), row]));
    await client.query("COMMIT");
    return WORKSPACE_MODULE_KEYS.map(moduleKey => ({
      moduleKey,
      enabled: current.get(moduleKey)?.enabled ?? DEFAULT_ENABLED[moduleKey],
      revision: current.get(moduleKey)?.revision ?? 0,
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}

/** Append an organization-managed revision. PostgreSQL fences authority,
 * serializes competing revisions, and writes an audit in the same transaction. */
export async function setWorkspaceModule(
  databaseUrl: string,
  input: z.input<typeof Write>,
): Promise<WorkspaceModuleSetting> {
  const parsed = Write.parse(input);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    await client.query(`INSERT INTO public.workspace_module_revisions
      (organization_id,module_key,revision,enabled,actor_user_id)
      VALUES($1,$2,$3,$4,$5)`, [parsed.organizationId, parsed.moduleKey,
      parsed.expectedRevision + 1, parsed.enabled, parsed.actorUserId]);
    await client.query("COMMIT");
    return { moduleKey: parsed.moduleKey, enabled: parsed.enabled, revision: parsed.expectedRevision + 1 };
  } catch (error) {
    await client.query("ROLLBACK");
    if (isPgCode(error, "40001") || isPgCode(error, "23505")) throw new WorkspaceModuleConflict();
    if (isPgCode(error, "42501")) throw new WorkspaceModuleDenied();
    throw error;
  } finally { await client.end(); }
}
