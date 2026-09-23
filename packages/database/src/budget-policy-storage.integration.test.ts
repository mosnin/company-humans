import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createCanonicalId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("budget policy storage", () => {
  it("binds exact meters and tenant scopes, preserves revisions, and restricts service writes", async () => {
    const suffix = randomBytes(6).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    const alice = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `bud-a-${suffix}`, primaryEmail: null, displayName: "Alice", status: "active", eventTimestamp: 1 });
    const bob = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `bud-b-${suffix}`, primaryEmail: null, displayName: "Bob", status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `bud-a-${suffix}`, name: "A" });
    const other = await createOrganization(databaseUrl!, { ownerUserId: bob, slug: `bud-b-${suffix}`, name: "B" });
    const product = createCanonicalId("product");
    const anotherProduct = createCanonicalId("product");
    const instance = createCanonicalId("productInstance");
    const wrongProductInstance = createCanonicalId("productInstance");
    const otherInstance = createCanonicalId("productInstance");
    const team = createCanonicalId("team");
    const otherTeam = createCanonicalId("team");
    const policyId = createCanonicalId("budget");
    const secondPolicyId = createCanonicalId("budget");
    const metadata = { schemaVersion: 1, description: "Budget fixture", category: "sales", supportedCapabilities: ["lead-enrichment"], provisioningModes: ["connected"], supportedMemberOperations: ["provision", "suspend"], usageMeters: ["enriched-leads"], requiredPermissions: ["product.use"], adapterVersion: "1.0.0", billingBehavior: "organization_sponsored", deepLinks: {}, connectionRequirements: ["service-credential"] };
    const policySql = `INSERT INTO budget_policies
      (id,organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind,
       product_instance_id,team_id,membership_id,capability_key,created_by_user_id)
      VALUES($1,$2,$3,'enriched-leads',$4,$5,'utc_month',$6,$7,$8,$9,$10,$11)`;
    const revisionSql = `INSERT INTO budget_policy_revisions
      (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`;
    async function rejected(sql: string, args: unknown[], pattern?: RegExp) {
      await admin.query("SAVEPOINT budget_case");
      try {
        await expect(admin.query(sql, args)).rejects.toThrow(pattern);
      } finally {
        await admin.query("ROLLBACK TO SAVEPOINT budget_case");
      }
    }
    try {
      await admin.query("BEGIN");
      await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Budget fixture','ready',$3),($4,$5,'Other product','ready',$3)", [product, `bud-${suffix}`, metadata, anotherProduct, `budx-${suffix}`]);
      await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'primary','connected',$4),($5,$2,$6,'other','connected',$4),($7,$8,$3,'primary','connected',$9)", [instance, org.organizationId, product, alice, wrongProductInstance, anotherProduct, otherInstance, other.organizationId, bob]);
      await admin.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'Sales'),($3,$4,'Sales')", [team, org.organizationId, otherTeam, other.organizationId]);
      await admin.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'enriched-leads',1,'lead','sum','Leads'),($1,'enriched-leads',2,'lead','sum','Leads v2')", [product]);

      await admin.query("SET LOCAL ROLE company_human_service");
      await admin.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [alice, org.organizationId]);
      expect((await admin.query("SELECT unit FROM meter_definitions WHERE product_id=$1 AND meter_key='enriched-leads'", [product])).rowCount).toBe(2);
      const base = [policyId, org.organizationId, product, 1, "lead", "organization", null, null, null, null, alice];
      await admin.query(policySql, base);
      await admin.query(policySql, [secondPolicyId, org.organizationId, product, 1, "lead", "organization", null, null, null, null, alice]);
      await admin.query(revisionSql, [org.organizationId, policyId, 1, "1.000001", "warning", "active", alice]);
      await admin.query(revisionSql, [org.organizationId, secondPolicyId, 1, "2", "hard_stop", "active", alice]);
      expect((await admin.query("SELECT id FROM budget_policies WHERE organization_id=$1 AND scope_kind='organization' ORDER BY id", [org.organizationId])).rowCount).toBe(2);
      await admin.query(revisionSql, [org.organizationId, policyId, 2, "0", "hard_stop", "disabled", alice]);
      expect((await admin.query("SELECT revision,maximum_quantity,action,status FROM budget_policy_revisions WHERE budget_policy_id=$1 ORDER BY revision", [policyId])).rows)
        .toEqual([{ revision: 1, maximum_quantity: "1.000001", action: "warning", status: "active" }, { revision: 2, maximum_quantity: "0", action: "hard_stop", status: "disabled" }]);

      for (const [scope, instanceRef, teamRef, memberRef, capability] of [
        ["product", null, null, null, null], ["meter", null, null, null, null],
        ["product_instance", instance, null, null, null], ["team", null, team, null, null],
        ["member", null, null, org.ownerMembershipId, null],
        ["capability", null, null, null, "lead-enrichment"],
      ]) {
        const id = createCanonicalId("budget");
        await admin.query(policySql, [id, org.organizationId, product, 2, "lead", scope, instanceRef, teamRef, memberRef, capability, alice]);
        await admin.query(revisionSql, [org.organizationId, id, 1, "3", "informational", "active", alice]);
      }
      const undeclaredCapability = createCanonicalId("budget");
      await admin.query(policySql, [undeclaredCapability, org.organizationId, product, 1, "lead", "capability", null, null, null, "unknown-capability", alice]);
      await rejected(revisionSql, [org.organizationId, undeclaredCapability, 1, "1", "warning", "active", alice], /ready product and declared meter or capability/);
      await admin.query(revisionSql, [org.organizationId, undeclaredCapability, 1, "1", "warning", "disabled", alice]);
      await admin.query("RESET ROLE");
      await admin.query("UPDATE products SET catalog_status='retired' WHERE id=$1", [product]);
      await admin.query("SET LOCAL ROLE company_human_service");
      await rejected(revisionSql, [org.organizationId, policyId, 3, "1", "warning", "active", alice], /ready product and declared meter or capability/);
      await admin.query(revisionSql, [org.organizationId, policyId, 3, "1", "warning", "disabled", alice]);
      await admin.query("RESET ROLE");
      await admin.query("UPDATE products SET catalog_status='ready' WHERE id=$1", [product]);
      await admin.query("SET LOCAL ROLE company_human_service");
      const malformedCatalogs: unknown[] = [
        null,
        { usageMeters: ["enriched-leads"] },
        { ...metadata, extraKey: true },
        Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "description")),
        { ...metadata, usageMeters: { "enriched-leads": true } },
        { ...metadata, supportedCapabilities: { "lead-enrichment": true } },
        { ...metadata, schemaVersion: "1" },
      ];
      for (const malformed of malformedCatalogs) {
        await admin.query("RESET ROLE");
        await admin.query("UPDATE products SET catalog_metadata=$2 WHERE id=$1", [product, malformed]);
        await admin.query("SET LOCAL ROLE company_human_service");
        await rejected(revisionSql, [org.organizationId, policyId, 4, "1", "warning", "active", alice],
          /ready product and declared meter or capability/);
      }
      await admin.query("RESET ROLE");
      await admin.query("UPDATE products SET catalog_metadata=$2 WHERE id=$1", [product, metadata]);
      await admin.query("SET LOCAL ROLE company_human_service");

      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "credit", "organization", null, null, null, null, alice]);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 99, "lead", "organization", null, null, null, null, alice]);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "lead", "product_instance", wrongProductInstance, null, null, null, alice]);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "lead", "product_instance", otherInstance, null, null, null, alice]);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "lead", "team", null, otherTeam, null, null, alice]);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "lead", "member", null, null, other.ownerMembershipId, null, alice]);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "lead", "team", null, null, null, null, alice]);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "lead", "organization", instance, null, null, null, alice]);
      await rejected(revisionSql, [other.organizationId, policyId, 4, "1", "warning", "active", alice]);
      await rejected(revisionSql, [org.organizationId, policyId, 5, "1", "warning", "active", alice], /must follow/);
      await rejected(`INSERT INTO budget_policy_revisions
        (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id,created_at)
        VALUES($1,$2,4,1,'warning','active',$3,'2000-01-01')`, [org.organizationId, policyId, alice], /permission denied/);
      for (const invalid of ["-1", "NaN", "Infinity", "0.0000001", "1000000000000"]) {
        await rejected(revisionSql, [org.organizationId, policyId, 4, invalid, "warning", "active", alice]);
      }
      await rejected("UPDATE budget_policies SET window_key='utc_day' WHERE id=$1", [policyId]);
      await rejected("DELETE FROM budget_policy_revisions WHERE budget_policy_id=$1", [policyId]);
      await rejected("DELETE FROM budget_policies WHERE id=$1", [policyId]);
      await admin.query("SELECT set_config('company_human.user_id',$1,true)", [bob]);
      expect((await admin.query("SELECT id FROM budget_policies WHERE organization_id=$1", [org.organizationId])).rowCount).toBe(0);
      expect((await admin.query("SELECT budget_policy_id FROM budget_policy_revisions WHERE organization_id=$1", [org.organizationId])).rowCount).toBe(0);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "lead", "organization", null, null, null, null, bob]);
      await rejected(revisionSql, [org.organizationId, policyId, 4, "1", "warning", "active", bob]);
      await admin.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [alice, org.organizationId]);
      await rejected(policySql, [createCanonicalId("budget"), org.organizationId, product, 1, "lead", "organization", null, null, null, null, bob]);
      await rejected(revisionSql, [org.organizationId, policyId, 4, "1", "warning", "active", bob]);
      await admin.query("ROLLBACK");
    } finally {
      try { await admin.query("ROLLBACK"); } catch { /* connection already ended */ }
      for (const table of ["identity_audit_events", "memberships", "roles"]) await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`, [[org.organizationId, other.organizationId]]);
      await admin.query("DELETE FROM organizations WHERE id=ANY($1)", [[org.organizationId, other.organizationId]]);
      await admin.query("DELETE FROM users WHERE id=ANY($1)", [[alice, bob]]);
      await admin.end();
    }
  });

  it("serializes competing first revisions so one stale writer loses", async () => {
    const suffix = randomBytes(6).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    const user = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `bud-race-${suffix}`, primaryEmail: null, displayName: "Owner", status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: user, slug: `bud-race-${suffix}`, name: "Race" });
    const product = createCanonicalId("product");
    const policy = createCanonicalId("budget");
    const clients = [new Client({ connectionString: databaseUrl }), new Client({ connectionString: databaseUrl })];
    const metadata = { schemaVersion: 1, description: "Budget race fixture", category: "testing",
      supportedCapabilities: [], provisioningModes: ["connected"], supportedMemberOperations: [],
      usageMeters: ["events"], requiredPermissions: [], adapterVersion: "1.0.0",
      billingBehavior: "organization_sponsored", deepLinks: {}, connectionRequirements: [] };
    try {
      await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Race meter','ready',$3)", [product, `bud-race-${suffix}`, metadata]);
      await admin.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'events',1,'event','sum','Events')", [product]);
      await admin.query("BEGIN");
      await admin.query("SET LOCAL ROLE company_human_service");
      await admin.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [user, org.organizationId]);
      await admin.query(`INSERT INTO budget_policies
        (id,organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind,created_by_user_id)
        VALUES($1,$2,$3,'events',1,'event','utc_day','meter',$4)`, [policy, org.organizationId, product, user]);
      await admin.query("COMMIT");
      for (const client of clients) await client.connect();
      const write = async (client: Client) => {
        await client.query("BEGIN");
        try {
          await client.query("SET LOCAL ROLE company_human_service");
          await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [user, org.organizationId]);
          await client.query(`INSERT INTO budget_policy_revisions
            (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
            VALUES($1,$2,1,5,'warning','active',$3)`, [org.organizationId, policy, user]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      };
      const outcomes = await Promise.allSettled(clients.map(write));
      expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
      expect((await admin.query("SELECT revision FROM budget_policy_revisions WHERE budget_policy_id=$1", [policy])).rows)
        .toEqual([{ revision: 1 }]);
      await expect(admin.query("UPDATE budget_policy_revisions SET action='hard_stop' WHERE budget_policy_id=$1", [policy]))
        .rejects.toThrow("immutable");
      await expect(admin.query("UPDATE budget_policies SET window_key='utc_month' WHERE id=$1", [policy]))
        .rejects.toThrow("immutable");

      const budget = clients[0]!;
      const revoker = clients[1]!;
      const role = (await admin.query<{ role_id: string }>(
        "SELECT role_id FROM memberships WHERE id=$1", [org.ownerMembershipId])).rows[0]!.role_id;
      const nextSql = `INSERT INTO budget_policy_revisions
        (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
        VALUES($1,$2,$3,5,'warning','active',$4)`;
      const serviceBegin = async () => {
        await budget.query("BEGIN");
        await budget.query("SET LOCAL ROLE company_human_service");
        await budget.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [user, org.organizationId]);
      };
      // Budget takes the authority lock first. Revocation waits, so the
      // committed revision is ordered before the permission loss.
      await serviceBegin();
      await budget.query(nextSql, [org.organizationId, policy, 2, user]);
      await revoker.query("BEGIN");
      let removalSettled = false;
      const removal = revoker.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='budgets.manage'", [org.organizationId, role]);
      removal.then(() => { removalSettled = true; }, () => { removalSettled = true; });
      await new Promise(resolve => setTimeout(resolve, 70));
      expect(removalSettled).toBe(false);
      await budget.query("COMMIT");
      await removal;
      await revoker.query("COMMIT");
      expect((await admin.query("SELECT revision FROM budget_policy_revisions WHERE budget_policy_id=$1 ORDER BY revision", [policy])).rows)
        .toEqual([{ revision: 1 }, { revision: 2 }]);

      await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'budgets.manage')", [org.organizationId, role]);
      // Revocation takes the authority lock first. The waiting budget write
      // sees its committed result and cannot append a revision afterward.
      await revoker.query("BEGIN");
      await revoker.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='budgets.manage'", [org.organizationId, role]);
      await serviceBegin();
      let writeSettled = false;
      const staleWrite = budget.query(nextSql, [org.organizationId, policy, 3, user]);
      staleWrite.then(() => { writeSettled = true; }, () => { writeSettled = true; });
      await new Promise(resolve => setTimeout(resolve, 70));
      expect(writeSettled).toBe(false);
      await revoker.query("COMMIT");
      await expect(staleWrite).rejects.toThrow(/Budget policy authority unavailable/);
      await budget.query("ROLLBACK");
      expect((await admin.query("SELECT revision FROM budget_policy_revisions WHERE budget_policy_id=$1 ORDER BY revision", [policy])).rows)
        .toEqual([{ revision: 1 }, { revision: 2 }]);
      await serviceBegin();
      await expect(budget.query(`INSERT INTO budget_policies
        (id,organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind,created_by_user_id)
        VALUES($1,$2,$3,'events',1,'event','utc_day','meter',$4)`,
      [createCanonicalId("budget"), org.organizationId, product, user])).rejects.toThrow();
      await budget.query("ROLLBACK");
      await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'budgets.manage')", [org.organizationId, role]);

      const revocationWins = async (revokeSql: string, revokeArgs: unknown[],
        restoreSql: string, restoreArgs: unknown[], expected: RegExp) => {
        await revoker.query("BEGIN");
        await revoker.query(revokeSql, revokeArgs);
        await serviceBegin();
        let settled = false;
        const attempted = budget.query(nextSql, [org.organizationId, policy, 3, user]);
        attempted.then(() => { settled = true; }, () => { settled = true; });
        await new Promise(resolve => setTimeout(resolve, 70));
        expect(settled).toBe(false);
        await revoker.query("COMMIT");
        await expect(attempted).rejects.toThrow(expected);
        await budget.query("ROLLBACK");
        await admin.query(restoreSql, restoreArgs);
      };
      await revocationWins("UPDATE products SET catalog_status='retired' WHERE id=$1", [product],
        "UPDATE products SET catalog_status='ready' WHERE id=$1", [product], /ready product and declared meter or capability/);
      await revocationWins("UPDATE memberships SET status='suspended' WHERE id=$1", [org.ownerMembershipId],
        "UPDATE memberships SET status='active' WHERE id=$1", [org.ownerMembershipId], /Budget policy authority unavailable/);
      await revocationWins("UPDATE users SET status='deleted' WHERE id=$1", [user],
        "UPDATE users SET status='active' WHERE id=$1", [user], /Budget policy actor unavailable/);
      await budget.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await budget.query("SET LOCAL ROLE company_human_service");
      await budget.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [user, org.organizationId]);
      await expect(budget.query(nextSql, [org.organizationId, policy, 3, user]))
        .rejects.toThrow(/Budget policy authority unavailable/);
      await budget.query("ROLLBACK");
      expect((await admin.query("SELECT revision FROM budget_policy_revisions WHERE budget_policy_id=$1 ORDER BY revision", [policy])).rows)
        .toEqual([{ revision: 1 }, { revision: 2 }]);
    } finally {
      await Promise.all(clients.map(async client => {
        try { await client.query("ROLLBACK"); } catch { /* not connected */ }
        try { await client.end(); } catch { /* not connected */ }
      }));
      // Only the migration owner can disable immutable triggers. Keep this
      // cleanup atomic and locked so the test can run repeatedly on one DB.
      await admin.query("BEGIN");
      try {
        await admin.query("LOCK TABLE budget_policy_revisions,budget_policies,meter_definitions IN ACCESS EXCLUSIVE MODE");
        await admin.query("ALTER TABLE budget_policy_revisions NO FORCE ROW LEVEL SECURITY");
        await admin.query("ALTER TABLE budget_policies NO FORCE ROW LEVEL SECURITY");
        await admin.query("ALTER TABLE budget_policy_revisions DISABLE TRIGGER immutable_budget_policy_revision");
        await admin.query("ALTER TABLE budget_policies DISABLE TRIGGER immutable_budget_policy");
        await admin.query("ALTER TABLE meter_definitions DISABLE TRIGGER immutable_meter");
        await admin.query("DELETE FROM budget_policy_revisions WHERE budget_policy_id=$1", [policy]);
        await admin.query("DELETE FROM budget_policies WHERE id=$1", [policy]);
        await admin.query("DELETE FROM meter_definitions WHERE product_id=$1", [product]);
        await admin.query("ALTER TABLE budget_policy_revisions ENABLE TRIGGER immutable_budget_policy_revision");
        await admin.query("ALTER TABLE budget_policies ENABLE TRIGGER immutable_budget_policy");
        await admin.query("ALTER TABLE meter_definitions ENABLE TRIGGER immutable_meter");
        await admin.query("ALTER TABLE budget_policy_revisions FORCE ROW LEVEL SECURITY");
        await admin.query("ALTER TABLE budget_policies FORCE ROW LEVEL SECURITY");
        await admin.query("COMMIT");
      } catch (error) {
        await admin.query("ROLLBACK");
        throw error;
      }
      for (const table of ["identity_audit_events", "memberships", "roles"]) await admin.query(`DELETE FROM ${table} WHERE organization_id=$1`, [org.organizationId]);
      await admin.query("DELETE FROM organizations WHERE id=$1", [org.organizationId]);
      await admin.query("DELETE FROM users WHERE id=$1", [user]);
      await admin.query("DELETE FROM products WHERE id=$1", [product]);
      await admin.end();
    }
  });
});
