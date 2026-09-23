import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { readWorkspaceModules, setWorkspaceModule, WorkspaceModuleConflict, WorkspaceModuleDenied } from "./workspace-modules.js";

const databaseUrl = process.env.DATABASE_URL;

// Disposable fixture cleanup needs table-owner DDL because production history
// is deliberately immutable and FORCE RLS hides DELETE from every runtime role.
async function removeFixtureRevisions(admin: Client, organizationIds: string[]) {
  await admin.query("BEGIN");
  try {
    await admin.query("ALTER TABLE public.workspace_module_revisions DISABLE ROW LEVEL SECURITY");
    await admin.query("ALTER TABLE public.workspace_module_revisions DISABLE TRIGGER workspace_module_immutable");
    await admin.query("DELETE FROM public.workspace_module_revisions WHERE organization_id=ANY($1)", [organizationIds]);
    await admin.query("ALTER TABLE public.workspace_module_revisions ENABLE TRIGGER workspace_module_immutable");
    await admin.query("ALTER TABLE public.workspace_module_revisions ENABLE ROW LEVEL SECURITY");
    await admin.query("COMMIT");
  } catch (error) { await admin.query("ROLLBACK"); throw error; }
}

async function asMember<T>(admin: Client, actorUserId: string, organizationId: string, query: () => Promise<T>): Promise<T> {
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL ROLE company_human_app");
    await admin.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [actorUserId, organizationId]);
    const result = await query();
    await admin.query("ROLLBACK");
    return result;
  } catch (error) { await admin.query("ROLLBACK"); throw error; }
}

describe.skipIf(!databaseUrl)("workspace module settings", () => {
  it("serves member defaults and immutable audited revisions without granting product access", async () => {
    const suffix = randomBytes(5).toString("hex");
    const owner = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `module-owner-${suffix}`, primaryEmail: null, displayName: "Owner", status: "active", eventTimestamp: 1 });
    const outsider = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `module-outsider-${suffix}`, primaryEmail: null, displayName: "Outsider", status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: owner, slug: `module-a-${suffix}`, name: "Module A" });
    const other = await createOrganization(databaseUrl!, { ownerUserId: outsider, slug: `module-b-${suffix}`, name: "Module B" });
    const appRole = `ch_module_app_${suffix}`;
    const serviceRole = `ch_module_service_${suffix}`;
    const appPassword = randomBytes(16).toString("hex");
    const servicePassword = randomBytes(16).toString("hex");
    const appUrl = new URL(databaseUrl!);
    appUrl.username = appRole;
    appUrl.password = appPassword;
    const serviceUrl = new URL(databaseUrl!);
    serviceUrl.username = serviceRole;
    serviceUrl.password = servicePassword;
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appPassword}'`);
      await admin.query(`CREATE ROLE ${serviceRole} LOGIN PASSWORD '${servicePassword}'`);
      await admin.query(`GRANT company_human_app TO ${appRole}`);
      await admin.query(`GRANT company_human_service TO ${serviceRole}`);

      const defaults = await readWorkspaceModules(appUrl.toString(), { actorUserId: owner, organizationId: org.organizationId });
      expect(defaults).toHaveLength(8);
      expect(defaults.find(setting => setting.moduleKey === "work")).toEqual({ moduleKey: "work", enabled: true, revision: 0 });
      expect(defaults.filter(setting => setting.moduleKey !== "work").every(setting => !setting.enabled && setting.revision === 0)).toBe(true);
      await expect(readWorkspaceModules(appUrl.toString(), { actorUserId: outsider, organizationId: org.organizationId }))
        .rejects.toBeInstanceOf(WorkspaceModuleDenied);
      await expect(setWorkspaceModule(serviceUrl.toString(), {
        actorUserId: outsider, organizationId: org.organizationId, moduleKey: "crm", enabled: true, expectedRevision: 0,
      })).rejects.toBeInstanceOf(WorkspaceModuleDenied);

      expect(await setWorkspaceModule(serviceUrl.toString(), {
        actorUserId: owner, organizationId: org.organizationId, moduleKey: "crm", enabled: true, expectedRevision: 0,
      })).toEqual({ moduleKey: "crm", enabled: true, revision: 1 });
      expect(await setWorkspaceModule(serviceUrl.toString(), {
        actorUserId: owner, organizationId: org.organizationId, moduleKey: "crm", enabled: false, expectedRevision: 1,
      })).toEqual({ moduleKey: "crm", enabled: false, revision: 2 });
      await expect(setWorkspaceModule(serviceUrl.toString(), {
        actorUserId: owner, organizationId: org.organizationId, moduleKey: "crm", enabled: true, expectedRevision: 0,
      })).rejects.toBeInstanceOf(WorkspaceModuleConflict);
      const current = await readWorkspaceModules(appUrl.toString(), { actorUserId: owner, organizationId: org.organizationId });
      expect(current.find(setting => setting.moduleKey === "crm")).toEqual({ moduleKey: "crm", enabled: false, revision: 2 });
      const app = new Client({ connectionString: appUrl.toString() });
      await app.connect();
      try {
        await app.query("BEGIN");
        await app.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [owner, org.organizationId]);
        await expect(app.query("SELECT actor_user_id,created_at FROM public.workspace_module_revisions WHERE organization_id=$1", [org.organizationId]))
          .rejects.toThrow(/permission denied/);
        await app.query("ROLLBACK");
      } finally { await app.end(); }
      expect((await asMember(admin, owner, org.organizationId, () => admin.query("SELECT revision,enabled FROM public.workspace_module_revisions WHERE organization_id=$1 AND module_key='crm' ORDER BY revision", [org.organizationId]))).rows)
        .toEqual([{ revision: 1, enabled: true }, { revision: 2, enabled: false }]);
      const audit = await asMember(admin, owner, org.organizationId, () => admin.query<{ after_state: { revision: number; moduleKey: string }; envelope: { actor: { userId: string } } }>(
        "SELECT after_state,envelope FROM public.identity_audit_events WHERE organization_id=$1 AND action='workspace.module.configured' ORDER BY occurred_at,id", [org.organizationId]));
      expect(audit.rows.map(row => row.after_state.revision).sort()).toEqual([1, 2]);
      expect(audit.rows.every(row => row.after_state.moduleKey === "crm" && row.envelope.actor.userId === owner)).toBe(true);
      expect((await asMember(admin, owner, org.organizationId, () => admin.query("SELECT count(*)::int AS total FROM public.product_instances WHERE organization_id=$1", [org.organizationId]))).rows[0]?.total).toBe(0);

      // Direct SQL cannot rewrite history, forge an actor, cross tenants, or
      // produce an unaudited accepted revision.
      const service = new Client({ connectionString: serviceUrl.toString() });
      await service.connect();
      try {
        await service.query("BEGIN");
        await service.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [owner, org.organizationId]);
        const denied = async (sql: string, args: unknown[]) => {
          await service.query("SAVEPOINT module_denial");
          try { await expect(service.query(sql, args)).rejects.toThrow(); }
          finally { await service.query("ROLLBACK TO SAVEPOINT module_denial"); }
        };
        await denied("UPDATE public.workspace_module_revisions SET enabled=true WHERE organization_id=$1", [org.organizationId]);
        await denied("DELETE FROM public.workspace_module_revisions WHERE organization_id=$1", [org.organizationId]);
        await denied("INSERT INTO public.workspace_module_revisions(organization_id,module_key,revision,enabled,actor_user_id) VALUES($1,'scalar',1,true,$2)", [org.organizationId, owner]);
        await denied("INSERT INTO public.workspace_module_revisions(organization_id,module_key,revision,enabled,actor_user_id) VALUES($1,'creator',1,true,$2)", [other.organizationId, owner]);
        await denied("INSERT INTO public.workspace_module_revisions(organization_id,module_key,revision,enabled,actor_user_id) VALUES($1,'creator',1,true,$2)", [org.organizationId, outsider]);
        await denied("INSERT INTO public.workspace_module_revisions(organization_id,module_key,revision,enabled,actor_user_id,created_at) VALUES($1,'creator',1,true,$2,'2000-01-01')", [org.organizationId, owner]);
        await service.query("INSERT INTO public.workspace_module_revisions(organization_id,module_key,revision,enabled,actor_user_id) VALUES($1,'team',1,true,$2)", [org.organizationId, owner]);
        await service.query("COMMIT");
      } finally { await service.end(); }
      const directAudit = await asMember(admin, owner, org.organizationId, () => admin.query(
        "SELECT after_state FROM public.identity_audit_events WHERE organization_id=$1 AND action='workspace.module.configured' AND after_state->>'moduleKey'='team'", [org.organizationId]));
      expect(directAudit.rowCount).toBe(1);

      // Revoke the exact grant. A stale service request must now fail at the
      // database even if it still supplies the former admin's context.
      await admin.query("DELETE FROM public.role_permissions WHERE organization_id=$1 AND role_id=(SELECT role_id FROM public.memberships WHERE id=$2) AND permission_key='organization.manage'", [org.organizationId, org.ownerMembershipId]);
      await expect(setWorkspaceModule(serviceUrl.toString(), {
        actorUserId: owner, organizationId: org.organizationId, moduleKey: "creator", enabled: true, expectedRevision: 0,
      })).rejects.toBeInstanceOf(WorkspaceModuleDenied);
      const revokedService = new Client({ connectionString: serviceUrl.toString() });
      await revokedService.connect();
      try {
        await revokedService.query("BEGIN");
        await revokedService.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [owner, org.organizationId]);
        await expect(revokedService.query(
          "INSERT INTO public.workspace_module_revisions(organization_id,module_key,revision,enabled,actor_user_id) VALUES($1,'creator',1,true,$2)",
          [org.organizationId, owner])).rejects.toThrow();
        await revokedService.query("ROLLBACK");
      } finally { await revokedService.end(); }
      expect((await asMember(admin, owner, org.organizationId, () => admin.query("SELECT count(*)::int AS total FROM public.workspace_module_revisions WHERE organization_id=$1 AND module_key='creator'", [org.organizationId]))).rows[0]?.total).toBe(0);
    } finally {
      await removeFixtureRevisions(admin, [org.organizationId, other.organizationId]);
      await admin.query("DELETE FROM public.identity_audit_events WHERE organization_id=ANY($1)", [[org.organizationId, other.organizationId]]);
      await admin.query("DELETE FROM public.role_permissions WHERE organization_id=ANY($1)", [[org.organizationId, other.organizationId]]);
      await admin.query("DELETE FROM public.memberships WHERE organization_id=ANY($1)", [[org.organizationId, other.organizationId]]);
      await admin.query("DELETE FROM public.roles WHERE organization_id=ANY($1)", [[org.organizationId, other.organizationId]]);
      await admin.query("DELETE FROM public.organizations WHERE id=ANY($1)", [[org.organizationId, other.organizationId]]);
      await admin.query("DELETE FROM public.users WHERE id=ANY($1)", [[owner, outsider]]);
      await admin.query(`REVOKE company_human_app FROM ${appRole}`);
      await admin.query(`REVOKE company_human_service FROM ${serviceRole}`);
      await admin.query(`DROP ROLE ${appRole}`);
      await admin.query(`DROP ROLE ${serviceRole}`);
      await admin.end();
    }
  });

  it("serializes two clients competing for the same first revision", async () => {
    const suffix = randomBytes(5).toString("hex");
    const owner = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `module-race-${suffix}`, primaryEmail: null, displayName: "Owner", status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: owner, slug: `module-race-${suffix}`, name: "Module Race" });
    const admin = new Client({ connectionString: databaseUrl });
    const clients = [new Client({ connectionString: databaseUrl }), new Client({ connectionString: databaseUrl })];
    await admin.connect();
    for (const client of clients) await client.connect();
    try {
      const write = async (client: Client, enabled: boolean) => {
        await client.query("BEGIN");
        try {
          await client.query("SET LOCAL ROLE company_human_service");
          await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [owner, org.organizationId]);
          await client.query("INSERT INTO public.workspace_module_revisions(organization_id,module_key,revision,enabled,actor_user_id) VALUES($1,'team',1,$2,$3)", [org.organizationId, enabled, owner]);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      };
      const results = await Promise.allSettled([write(clients[0]!, true), write(clients[1]!, false)]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
      expect((await asMember(admin, owner, org.organizationId, () => admin.query("SELECT count(*)::int AS total FROM public.workspace_module_revisions WHERE organization_id=$1 AND module_key='team'", [org.organizationId]))).rows[0]?.total).toBe(1);
      expect((await asMember(admin, owner, org.organizationId, () => admin.query("SELECT count(*)::int AS total FROM public.identity_audit_events WHERE organization_id=$1 AND action='workspace.module.configured'", [org.organizationId]))).rows[0]?.total).toBe(1);
    } finally {
      for (const client of clients) await client.end();
      await removeFixtureRevisions(admin, [org.organizationId]);
      await admin.query("DELETE FROM public.identity_audit_events WHERE organization_id=$1", [org.organizationId]);
      await admin.query("DELETE FROM public.role_permissions WHERE organization_id=$1", [org.organizationId]);
      await admin.query("DELETE FROM public.memberships WHERE organization_id=$1", [org.organizationId]);
      await admin.query("DELETE FROM public.roles WHERE organization_id=$1", [org.organizationId]);
      await admin.query("DELETE FROM public.organizations WHERE id=$1", [org.organizationId]);
      await admin.query("DELETE FROM public.users WHERE id=$1", [owner]);
      await admin.end();
    }
  });
});
