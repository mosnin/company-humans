import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { enableProductInstance, listProductInstances } from "./product-instances.js";
import { referenceProductId } from "./seed.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("organization product instances", () => {
  it("records admin enable intent once and keeps instances tenant isolated before adapter activation", async () => {
    const suffix = randomBytes(6).toString("hex");
    const roleName = `ch_app_test_${suffix}`;
    const serviceRoleName = `ch_app_service_${suffix}`;
    const password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_app TO ${roleName}`);
    await admin.query(`CREATE ROLE ${serviceRoleName} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_service TO ${serviceRoleName}`);
    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.username = roleName;
    runtimeUrl.password = password;
    const serviceUrl = new URL(runtimeUrl);
    serviceUrl.username = serviceRoleName;
    const alice = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `user_Alice${suffix}`, primaryEmail: null, displayName: "Alice", status: "active", eventTimestamp: 1 });
    const bob = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `user_Bob${suffix}`, primaryEmail: null, displayName: "Bob", status: "active", eventTimestamp: 1 });
    const aliceOrg = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `app-alice-${suffix}`, name: "Alice" });
    const bobOrg = await createOrganization(databaseUrl!, { ownerUserId: bob, slug: `app-bob-${suffix}`, name: "Bob" });
    const scalarId = referenceProductId("scalar");
    try {
      const concurrent = await Promise.all(Array.from({ length: 8 }, () => enableProductInstance(serviceUrl.toString(), {
        actorUserId: alice, organizationId: aliceOrg.organizationId, productId: scalarId, mode: "provisioned",
      })));
      const first = concurrent[0]!;
      expect(new Set(concurrent).size).toBe(1);
      const repeated = await enableProductInstance(serviceUrl.toString(), {
        actorUserId: alice, organizationId: aliceOrg.organizationId, productId: scalarId, mode: "provisioned",
      });
      expect(repeated).toBe(first);
      expect(await listProductInstances(runtimeUrl.toString(), bob, aliceOrg.organizationId)).toEqual([]);
      expect((await listProductInstances(runtimeUrl.toString(), alice, aliceOrg.organizationId)).map((instance) =>
        [instance.id, instance.provisioningStatus, instance.desiredEnabled])).toEqual([[first, "pending", true]]);
      await expect(enableProductInstance(serviceUrl.toString(), {
        actorUserId: bob, organizationId: aliceOrg.organizationId, productId: scalarId, mode: "provisioned",
      })).rejects.toThrow("Application administration denied");
      const count = await admin.query<{ count: string }>(
        `SELECT count(*) FROM identity_audit_events
         WHERE organization_id = $1 AND action = 'product.instance.enabled'`, [aliceOrg.organizationId],
      );
      expect(Number(count.rows[0]!.count)).toBe(1);
      await expect(enableProductInstance(serviceUrl.toString(), {
        actorUserId: alice, organizationId: aliceOrg.organizationId, productId: scalarId, mode: "connected",
      })).rejects.toThrow("Instance mode cannot change during enable");
      const independent = await enableProductInstance(serviceUrl.toString(), {
        actorUserId: bob, organizationId: bobOrg.organizationId, productId: scalarId, mode: "provisioned",
      });
      expect(independent).not.toBe(first);
    } finally {
      const orgIds = [aliceOrg.organizationId, bobOrg.organizationId];
      await admin.query("DELETE FROM product_instances WHERE organization_id = ANY($1)", [orgIds]);
      await admin.query("DELETE FROM identity_audit_events WHERE organization_id = ANY($1)", [orgIds]);
      await admin.query("DELETE FROM memberships WHERE organization_id = ANY($1)", [orgIds]);
      await admin.query("DELETE FROM roles WHERE organization_id = ANY($1)", [orgIds]);
      await admin.query("DELETE FROM organizations WHERE id = ANY($1)", [orgIds]);
      await admin.query("DELETE FROM users WHERE id = ANY($1)", [[alice, bob]]);
      await admin.query(`DROP ROLE ${roleName}`);
      await admin.query(`DROP ROLE ${serviceRoleName}`);
      await admin.end();
    }
  });
});
