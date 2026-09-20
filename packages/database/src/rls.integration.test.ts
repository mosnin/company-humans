import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { syncClerkUser } from "./clerk-users.js";
import { createOrganization } from "./organizations.js";
import { listVisibleOrganizations, resolveAccessContext } from "./rls.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("Postgres tenant RLS", () => {
  it("allows own tenant reads and updates while denying cross tenant rows and writes", async () => {
    const suffix = randomBytes(6).toString("hex");
    const roleName = `ch_rls_${suffix}`;
    const password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_app TO ${roleName}`);
    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.username = roleName;
    runtimeUrl.password = password;
    const aliceId = `user_Alice${suffix}`;
    const bobId = `user_Bob${suffix}`;
    const alice = await syncClerkUser(databaseUrl!, { clerkUserId: aliceId, primaryEmail: null, displayName: "Alice", status: "active", eventTimestamp: 1 });
    const bob = await syncClerkUser(databaseUrl!, { clerkUserId: bobId, primaryEmail: null, displayName: "Bob", status: "active", eventTimestamp: 1 });
    const aliceOrg = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `alice-rls-${suffix}`, name: "Alice Org" });
    const aliceSecondOrg = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `alice-second-${suffix}`, name: "Alice Second" });
    const bobOrg = await createOrganization(databaseUrl!, { ownerUserId: bob, slug: `bob-rls-${suffix}`, name: "Bob Org" });
    const runtime = new Client({ connectionString: runtimeUrl.toString() });
    await runtime.connect();
    try {
      expect((await listVisibleOrganizations(runtimeUrl.toString(), alice)).map((org) => org.id)).toEqual([aliceOrg.organizationId, aliceSecondOrg.organizationId]);
      expect((await listVisibleOrganizations(runtimeUrl.toString(), bob)).map((org) => org.id)).toEqual([bobOrg.organizationId]);
      expect((await resolveAccessContext(runtimeUrl.toString(), alice, aliceOrg.organizationId))?.userId).toBe(alice);
      expect((await resolveAccessContext(runtimeUrl.toString(), alice, aliceSecondOrg.organizationId))?.userId).toBe(alice);
      expect(await resolveAccessContext(runtimeUrl.toString(), alice, bobOrg.organizationId)).toBeNull();
      await expect(listVisibleOrganizations(databaseUrl!, alice)).rejects.toThrow("nonprivileged RLS role");
      expect((await runtime.query("SELECT id FROM organizations")).rows).toEqual([]);
      await runtime.query("BEGIN");
      await runtime.query("SELECT set_config('company_human.user_id', $1, true)", [alice]);
      expect((await runtime.query("SELECT id FROM organizations WHERE id = $1", [bobOrg.organizationId])).rows).toEqual([]);
      expect((await runtime.query("SELECT id FROM memberships WHERE organization_id = $1", [bobOrg.organizationId])).rows).toEqual([]);
      expect((await runtime.query("UPDATE organizations SET name = $1 WHERE id = $2 RETURNING id", ["Wrong change", bobOrg.organizationId])).rows).toEqual([]);
      expect((await runtime.query("UPDATE organizations SET name = $1 WHERE id = $2 RETURNING id", ["Alice Updated", aliceOrg.organizationId])).rows).toEqual([{ id: aliceOrg.organizationId }]);
      await expect(runtime.query("INSERT INTO organizations (id, slug, name, owner_user_id) VALUES ('ch_org_00000000000000000000000000000000', 'forbidden-test', 'No', $1)", [alice])).rejects.toThrow();
      await runtime.query("ROLLBACK");
      expect((await runtime.query("SELECT id FROM organizations")).rows).toEqual([]);
    } finally {
      await runtime.end();
      const organizationIds = [aliceOrg.organizationId, aliceSecondOrg.organizationId, bobOrg.organizationId];
      await admin.query("DELETE FROM memberships WHERE organization_id = ANY($1)", [organizationIds]);
      await admin.query("DELETE FROM roles WHERE organization_id = ANY($1)", [organizationIds]);
      await admin.query("DELETE FROM organizations WHERE id = ANY($1)", [organizationIds]);
      await admin.query("DELETE FROM users WHERE id = ANY($1)", [[alice, bob]]);
      await admin.query(`DROP ROLE ${roleName}`);
      await admin.end();
    }
  });
});
