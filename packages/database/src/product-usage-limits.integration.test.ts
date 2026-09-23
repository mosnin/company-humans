import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createCanonicalId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { readApplicationUsageLimits } from "./administration.js";
import { setProductUsageLimit } from "./product-usage-limits.js";
const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("finite product usage limit history", () => {
  it("preserves exact immutable quantities, serializes edits and rejects cross-tenant or unauthorized writes", async () => {
    const suffix = randomBytes(6).toString("hex"), role = `ch_limit_${suffix}`, password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl }); await admin.connect();
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`); await admin.query(`GRANT company_human_service TO ${role}`);
    const url = new URL(databaseUrl!); url.username = role; url.password = password;
    const runtime = new Client({ connectionString: url.toString() }); await runtime.connect();
    const alice = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `limit-a-${suffix}`, primaryEmail: null, displayName: "Alice", status: "active", eventTimestamp: 1 });
    const bob = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `limit-b-${suffix}`, primaryEmail: null, displayName: "Bob", status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `limit-a-${suffix}`, name: "A" });
    const other = await createOrganization(databaseUrl!, { ownerUserId: bob, slug: `limit-b-${suffix}`, name: "B" });
    const orgs = [org.organizationId, other.organizationId], product = createCanonicalId("product"), instance = createCanonicalId("productInstance");
    const metadata = { schemaVersion: 1, description: "Test only", category: "sales", supportedCapabilities: ["lead-enrichment"], provisioningModes: ["connected"], supportedMemberOperations: ["provision", "suspend"], usageMeters: ["enriched-leads"], requiredPermissions: ["product.use"], adapterVersion: "1.0.0", billingBehavior: "organization_sponsored", deepLinks: {}, connectionRequirements: ["service-credential"] };
    try {
      await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)", [product, `limit-${suffix}`, metadata]);
      await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'primary','connected',$4)", [instance, org.organizationId, product, alice]);
      const input = { actorUserId: alice, organizationId: org.organizationId, productInstanceId: instance, membershipId: null, meterKey: "enriched-leads", unit: "lead", window: "utc_month" as const, maximumQuantity: "999999999999.999999", expectedRevision: 0 };
      const concurrent = await Promise.allSettled(Array.from({ length: 5 }, () => setProductUsageLimit(url.toString(), input)));
      expect(concurrent.filter(x => x.status === "fulfilled")).toHaveLength(1); expect(concurrent.filter(x => x.status === "rejected")).toHaveLength(4);
      const first = concurrent.find(x => x.status === "fulfilled"); if (first?.status !== "fulfilled") throw new Error("No saved revision");
      const id = first.value.usageLimitId;
      expect((await admin.query("SELECT revision,status,attempt_count FROM usage_limit_jobs WHERE usage_limit_id=$1", [id])).rows).toEqual([{ revision: 1, status: 'pending', attempt_count: 0 }]);
      expect(first.value.maximumQuantity).toBe("999999999999.999999");
      expect((await admin.query("SELECT maximum_quantity FROM product_usage_limit_revisions WHERE usage_limit_id=$1", [id])).rows[0].maximum_quantity).toBe("999999999999.999999");
      const firstRead = await readApplicationUsageLimits(url.toString(), alice, org.organizationId, instance);
      expect(firstRead.providerEnforcementConfirmed).toBe(false);
      expect(firstRead.settings.find(row => row.window === "utc_month")?.maximumQuantity).toBe("999999999999.999999");
      expect(firstRead.settings.find(row => row.window === "utc_day")).toEqual({ meterKey: "enriched-leads", unit: "lead", window: "utc_day", revision: 0, maximumQuantity: null, organizationMaximumQuantity: null, memberMaximumQuantity: null, delivery: null, organizationDelivery: null, nonzeroAvailable: true });
      const stopped = await setProductUsageLimit(url.toString(), { ...input, maximumQuantity: "0.000000", expectedRevision: 1 });
      expect(stopped.maximumQuantity).toBe("0");
      expect((await admin.query("SELECT revision,status FROM usage_limit_jobs WHERE usage_limit_id=$1 ORDER BY revision", [id])).rows).toEqual([{ revision: 1, status: 'pending' }, { revision: 2, status: 'pending' }]);
      const member = await setProductUsageLimit(url.toString(), { ...input, membershipId: org.ownerMembershipId, maximumQuantity: "2.5" });
      expect(member.usageLimitId).not.toBe(id);
      const memberRead = await readApplicationUsageLimits(url.toString(), alice, org.organizationId, instance, org.ownerMembershipId);
      expect(memberRead.memberName).toBe("Alice");
      expect(memberRead.settings.find(row => row.window === "utc_month")).toEqual({ meterKey: "enriched-leads", unit: "lead", window: "utc_month", revision: 1, maximumQuantity: "2.5", organizationMaximumQuantity: "0", memberMaximumQuantity: "2.5", delivery: expect.objectContaining({status:'pending',attemptCount:0,attempts:[]}), organizationDelivery: expect.objectContaining({status:'pending',attemptCount:0,attempts:[]}), nonzeroAvailable: true });
      const defaultRead = await readApplicationUsageLimits(url.toString(), alice, org.organizationId, instance);
      expect(defaultRead.settings.find(row => row.window === "utc_month")?.revision).toBe(2);
      expect(defaultRead.settings.every(row => row.memberMaximumQuantity === null)).toBe(true);
      await expect(readApplicationUsageLimits(url.toString(), bob, org.organizationId, instance)).rejects.toThrow("administration denied");
      await expect(readApplicationUsageLimits(url.toString(), bob, other.organizationId, instance)).rejects.toThrow("administration denied");
      await expect(readApplicationUsageLimits(url.toString(), alice, org.organizationId, instance, other.ownerMembershipId)).rejects.toThrow("administration denied");
      await expect(setProductUsageLimit(url.toString(), { ...input, expectedRevision: 1 })).rejects.toThrow("Reload");
      await expect(setProductUsageLimit(url.toString(), { ...input, unit: "second", expectedRevision: 2 })).rejects.toThrow("unit is immutable");
      await expect(setProductUsageLimit(url.toString(), { ...input, unit: "second", window: "utc_day" })).rejects.toThrow("unit is immutable across scopes");
      await expect(setProductUsageLimit(url.toString(), { ...input, actorUserId: bob })).rejects.toThrow("Budget administration denied");
      await expect(setProductUsageLimit(url.toString(), { ...input, membershipId: other.ownerMembershipId })).rejects.toThrow("Membership unavailable");
      await expect(setProductUsageLimit(url.toString(), { ...input, organizationId: other.organizationId, actorUserId: bob })).rejects.toThrow("Product instance unavailable");
      await expect(setProductUsageLimit(url.toString(), { ...input, meterKey: "unknown" })).rejects.toThrow("Meter unavailable");
      await admin.query("UPDATE products SET catalog_metadata=NULL WHERE id=$1", [product]);
      await expect(setProductUsageLimit(url.toString(), { ...input, expectedRevision: 2 })).rejects.toThrow("Meter unavailable");
      const missingCatalog = await readApplicationUsageLimits(url.toString(), alice, org.organizationId, instance);
      expect(missingCatalog.settings).toHaveLength(3);
      expect(missingCatalog.settings.every(row => !row.nonzeroAvailable)).toBe(true);
      expect(missingCatalog.settings.find(row => row.window === "utc_month")?.maximumQuantity).toBe("0");
      await admin.query("UPDATE products SET catalog_metadata=$2 WHERE id=$1", [product, metadata]);
      const guard = `limit_audit_failure_${suffix}`;
      await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.target_id='${id}' AND NEW.action='product.usage_limit.configured' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
      try {
        await expect(setProductUsageLimit(url.toString(), { ...input, maximumQuantity: "1", expectedRevision: 2 })).rejects.toThrow("fixture audit failure");
        expect((await admin.query("SELECT max(revision) n FROM product_usage_limit_revisions WHERE usage_limit_id=$1", [id])).rows[0].n).toBe(2);
        expect((await admin.query("SELECT max(revision) n FROM usage_limit_jobs WHERE usage_limit_id=$1", [id])).rows[0].n).toBe(2);
      } finally { await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`); await admin.query(`DROP FUNCTION public.${guard}()`); }
      await admin.query("UPDATE products SET catalog_status='retired' WHERE id=$1", [product]);
      await expect(setProductUsageLimit(url.toString(), { ...input, expectedRevision: 2 })).rejects.toThrow("Meter unavailable");
      await setProductUsageLimit(url.toString(), { ...input, maximumQuantity: "0", expectedRevision: 2 });
      const retiredRead = await readApplicationUsageLimits(url.toString(), alice, org.organizationId, instance);
      expect(retiredRead.settings.find(row => row.window === "utc_month")?.revision).toBe(3);
      expect(retiredRead.settings.every(row => !row.nonzeroAvailable)).toBe(true);
      expect((await admin.query("SELECT revision,maximum_quantity FROM product_usage_limit_revisions WHERE usage_limit_id=$1 ORDER BY revision", [id])).rows).toEqual([{ revision: 1, maximum_quantity: "999999999999.999999" }, { revision: 2, maximum_quantity: "0" }, { revision: 3, maximum_quantity: "0" }]);
      expect((await admin.query("SELECT count(*)::int n FROM identity_audit_events WHERE target_id=$1", [id])).rows[0].n).toBe(3);
      await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)", [bob, other.organizationId]);
      expect((await runtime.query("SELECT * FROM product_usage_limits WHERE id=$1", [id])).rowCount).toBe(0);
      expect((await runtime.query("SELECT * FROM product_usage_limit_revisions WHERE usage_limit_id=$1", [id])).rowCount).toBe(0);
      expect((await runtime.query("SELECT * FROM usage_limit_jobs WHERE usage_limit_id=$1", [id])).rowCount).toBe(0);
      expect((await runtime.query("SELECT * FROM usage_limit_attempts WHERE usage_limit_id=$1", [id])).rowCount).toBe(0);
      await expect(runtime.query("INSERT INTO usage_limit_jobs(organization_id,usage_limit_id,revision) VALUES($1,$2,3)", [org.organizationId,id])).rejects.toThrow();
      await expect(admin.query("INSERT INTO usage_limit_jobs(organization_id,usage_limit_id,revision) VALUES($1,$2,4)", [other.organizationId,id])).rejects.toThrow();
      await expect(runtime.query("INSERT INTO product_usage_limit_revisions(organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id) VALUES($1,$2,4,1,$3)", [org.organizationId, id, bob])).rejects.toThrow();
      await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)", [alice, org.organizationId]);
      expect((await runtime.query("SELECT * FROM usage_limit_jobs WHERE usage_limit_id=$1", [id])).rowCount).toBe(3);
      await expect(runtime.query("UPDATE usage_limit_jobs SET status='succeeded' WHERE usage_limit_id=$1", [id])).rejects.toThrow();
      await expect(runtime.query("DELETE FROM usage_limit_jobs WHERE usage_limit_id=$1", [id])).rejects.toThrow();
      await expect(runtime.query("INSERT INTO usage_limit_jobs(organization_id,usage_limit_id,revision,status) VALUES($1,$2,4,'succeeded')", [org.organizationId,id])).rejects.toThrow();
      await expect(runtime.query("INSERT INTO usage_limit_attempts(organization_id,usage_limit_id,revision,attempt_number,lease_token) VALUES($1,$2,3,1,gen_random_uuid())", [org.organizationId,id])).rejects.toThrow();
      await expect(runtime.query("INSERT INTO product_usage_limit_revisions(organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id) VALUES($1,$2,5,1,$3)", [org.organizationId, id, alice])).rejects.toThrow("must follow");
      for (const invalid of ["-1", "NaN", "Infinity", "0.0000001", "1000000000000"]) await expect(runtime.query("INSERT INTO product_usage_limit_revisions(organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id) VALUES($1,$2,4,$3,$4)", [org.organizationId, id, invalid, alice])).rejects.toThrow();
      await expect(runtime.query("UPDATE product_usage_limit_revisions SET maximum_quantity=100 WHERE usage_limit_id=$1", [id])).rejects.toThrow();
      await expect(runtime.query("DELETE FROM product_usage_limit_revisions WHERE usage_limit_id=$1", [id])).rejects.toThrow();
      await expect(admin.query("INSERT INTO product_usage_limits(id,organization_id,product_instance_id,membership_id,meter_key,unit,window_key,created_by_user_id) VALUES($1,$2,$3,$4,'other','lead','utc_day',$5)", [createCanonicalId("usageLimit"), org.organizationId, instance, other.ownerMembershipId, alice])).rejects.toThrow();
      // Future workers may complete an attempt once; provenance and completed receipts cannot change.
      await admin.query("INSERT INTO usage_limit_attempts(organization_id,usage_limit_id,revision,attempt_number,lease_token) VALUES($1,$2,3,1,gen_random_uuid())", [org.organizationId,id]);
      await expect(admin.query("UPDATE usage_limit_attempts SET worker_role='forged' WHERE usage_limit_id=$1", [id])).rejects.toThrow("history is immutable");
      await expect(admin.query("UPDATE usage_limit_attempts SET revision=2 WHERE usage_limit_id=$1", [id])).rejects.toThrow("history is immutable");
      await admin.query("UPDATE usage_limit_attempts SET finished_at=now(),outcome='permanent_failure',failure_code='fixture_only' WHERE usage_limit_id=$1", [id]);
      await expect(admin.query("UPDATE usage_limit_attempts SET readback_receipt='{}'::jsonb WHERE usage_limit_id=$1", [id])).rejects.toThrow("history is immutable");
      await expect(runtime.query("UPDATE usage_limit_attempts SET outcome='succeeded' WHERE usage_limit_id=$1", [id])).rejects.toThrow();
      // An organization member without budgets.manage cannot edit or read policy history.
      const bobMembership = createCanonicalId("membership");
      await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')", [bobMembership, org.organizationId, bob]);
      await expect(setProductUsageLimit(url.toString(), { ...input, actorUserId: bob, expectedRevision: 3 })).rejects.toThrow("Budget administration denied");
      await expect(readApplicationUsageLimits(url.toString(), bob, org.organizationId, instance)).rejects.toThrow("administration denied");
      await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)", [bob, org.organizationId]);
      expect((await runtime.query("SELECT * FROM product_usage_limits WHERE id=$1", [id])).rowCount).toBe(0);
      // A V2 revision is a privileged storage fixture, never a V1 provider job.
      expect((await admin.query("SELECT DISTINCT contract_version,meter_version FROM product_usage_limit_revisions WHERE usage_limit_id=$1", [id])).rows)
        .toEqual([{ contract_version: 1, meter_version: null }]);
      await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)", [alice, org.organizationId]);
      await expect(runtime.query(`INSERT INTO product_usage_limit_revisions
        (organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id,contract_version,meter_version)
        VALUES($1,$2,4,0,$3,2,3)`, [org.organizationId,id,alice])).rejects.toThrow("permission denied");
      await expect(admin.query(`INSERT INTO product_usage_limit_revisions
        (organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id,contract_version,meter_version)
        VALUES($1,$2,4,0,$3,2,0)`, [org.organizationId,id,alice])).rejects.toThrow();
      await admin.query(`INSERT INTO product_usage_limit_revisions
        (organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id,contract_version,meter_version)
        VALUES($1,$2,4,0,$3,2,3)`, [org.organizationId,id,alice]);
      expect((await admin.query("SELECT revision FROM usage_limit_jobs WHERE usage_limit_id=$1 ORDER BY revision", [id])).rows)
        .toEqual([{ revision: 1 }, { revision: 2 }, { revision: 3 }]);
      await expect(setProductUsageLimit(url.toString(), { ...input, maximumQuantity: "0", expectedRevision: 4 })).rejects.toThrow("Reload");
      await expect(admin.query(`INSERT INTO product_usage_limit_revisions
        (organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id)
        VALUES($1,$2,5,0,$3)`, [org.organizationId,id,alice])).rejects.toThrow("cannot return to V1");
    } finally {
      await runtime.end();
      for (const table of ["usage_limit_attempts", "usage_limit_jobs", "product_usage_limit_revisions", "product_usage_limits", "identity_audit_events", "product_instances", "memberships", "roles"]) await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`, [orgs]);
      await admin.query("DELETE FROM organizations WHERE id=ANY($1)", [orgs]); await admin.query("DELETE FROM users WHERE id=ANY($1)", [[alice, bob]]);
      await admin.query("DELETE FROM products WHERE id=$1", [product]); await admin.query(`DROP ROLE ${role}`); await admin.end();
    }
  });
});
