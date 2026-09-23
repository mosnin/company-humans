import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createCanonicalId, projectActiveBudgetPoliciesV1, resolveBudgetPoliciesV1 } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { BudgetPolicyConflict, BudgetPolicyDenied, BudgetPolicyInvalid,
  createBudgetPolicy, readBudgetPolicies, reviseBudgetPolicy } from "./budget-policies.js";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.COMPANY_HUMAN_BUDGET_WRITER_TEST === "1";

describe.skipIf(!databaseUrl || !enabled)("versioned budget configuration", () => {
  it("keeps overlapping thresholds, revisions, disable state and tenant authorization without claiming enforcement", async () => {
    // This test commits fixtures for independent service-role connections. Run
    // only in a loopback database created for this test and dropped afterward.
    const target = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
      !target.pathname.slice(1).startsWith("company_human_budget_")) {
      throw new Error("Budget writer fixture requires a disposable loopback database");
    }
    const suffix = randomBytes(6).toString("hex");
    const roleName = `ch_budget_${suffix}`, password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_service TO ${roleName}`);
    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.username = roleName; runtimeUrl.password = password;
    const alice = await syncAuthUser(databaseUrl!, { authIssuer: "https://budget.test", authSubject: `budget-a-${suffix}`,
      primaryEmail: null, displayName: "Budget Alice", status: "active", eventTimestamp: 1 });
    const bob = await syncAuthUser(databaseUrl!, { authIssuer: "https://budget.test", authSubject: `budget-b-${suffix}`,
      primaryEmail: null, displayName: "Budget Bob", status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `budget-a-${suffix}`, name: "Budget A" });
    const other = await createOrganization(databaseUrl!, { ownerUserId: bob, slug: `budget-b-${suffix}`, name: "Budget B" });
    const product = createCanonicalId("product"), instance = createCanonicalId("productInstance");
    const team = createCanonicalId("team");
    const metadata = { schemaVersion: 1, description: "Budget fixture", category: "sales",
      supportedCapabilities: ["lead-enrichment"], provisioningModes: ["connected"],
      supportedMemberOperations: ["provision", "suspend"], usageMeters: ["enriched-leads"],
      requiredPermissions: ["product.use"], adapterVersion: "1.0.0", billingBehavior: "organization_sponsored",
      deepLinks: {}, connectionRequirements: [] };
    const meter = { meterKey: "enriched-leads", meterVersion: 1, unit: "lead" };
    try {
      await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Budget product','ready',$3)",
        [product, `budget-${suffix}`, metadata]);
      await admin.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'enriched-leads',1,'lead','sum','Enriched leads')", [product]);
      await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'main','connected',$4)",
        [instance, org.organizationId, product, alice]);
      await admin.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'Sales')", [team, org.organizationId]);
      await admin.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'contributor','active')",
        [createCanonicalId("membership"), org.organizationId, bob]);

      const base = { actorUserId: alice, organizationId: org.organizationId, productId: product,
        meter, window: "utc_month" as const, scope: { kind: "organization" as const } };
      const warning = await createBudgetPolicy(runtimeUrl.toString(), { ...base, maximumQuantity: "80.000000", action: "warning", status: "active" });
      const stop = await createBudgetPolicy(runtimeUrl.toString(), { ...base, maximumQuantity: "100", action: "hard_stop", status: "active" });
      const teamPolicy = await createBudgetPolicy(runtimeUrl.toString(), { ...base, scope: { kind: "team", teamId: team },
        maximumQuantity: "40", action: "soft_pause", status: "active" });
      const instancePolicy = await createBudgetPolicy(runtimeUrl.toString(), { ...base, scope: { kind: "product_instance", productInstanceId: instance },
        maximumQuantity: "500", action: "informational", status: "active" });
      const memberPolicy = await createBudgetPolicy(runtimeUrl.toString(), { ...base, scope: { kind: "member", membershipId: org.ownerMembershipId },
        maximumQuantity: "20", action: "manager_approval", status: "active" });
      const capabilityPolicy = await createBudgetPolicy(runtimeUrl.toString(), { ...base, scope: { kind: "capability", capabilityKey: "lead-enrichment" },
        maximumQuantity: "30", action: "emergency_shutdown", status: "active" });
      const productPolicy = await createBudgetPolicy(runtimeUrl.toString(), { ...base, scope: { kind: "product", productId: product },
        maximumQuantity: "600", action: "warning", status: "active" });
      const meterPolicy = await createBudgetPolicy(runtimeUrl.toString(), { ...base, scope: { kind: "meter" },
        maximumQuantity: "700", action: "informational", status: "active" });
      expect(warning.maximumQuantity).toBe("80");
      const current = await readBudgetPolicies(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId, productId: product, meter });
      expect(current).toHaveLength(8);
      expect(new Set(current.map(policy => policy.policyId)).size).toBe(8);
      expect(current.map(policy => policy.policyId)).toEqual(expect.arrayContaining([
        warning.policyId, stop.policyId, teamPolicy.policyId, instancePolicy.policyId,
        memberPolicy.policyId, capabilityPolicy.policyId, productPolicy.policyId, meterPolicy.policyId]));
      const operation = { schemaVersion: 1 as const, organizationId: org.organizationId, productId: product,
        productInstanceId: instance, membershipId: org.ownerMembershipId,
        operationTeam: { teamId: team, organizationId: org.organizationId, membershipId: org.ownerMembershipId },
        capabilityKey: "lead-enrichment", meter };
      const resolution = resolveBudgetPoliciesV1(operation, projectActiveBudgetPoliciesV1(operation, current));
      expect(resolution.constraints).toHaveLength(8);
      expect(resolution.constraints.filter(policy => policy.scope.kind === "organization")).toHaveLength(2);
      expect(resolution.windows[0]?.earliestThresholdQuantity).toBe("20");

      const concurrent = await Promise.allSettled([
        reviseBudgetPolicy(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId,
          policyId: warning.policyId, expectedRevision: 1, maximumQuantity: "90", action: "warning", status: "active" }),
        reviseBudgetPolicy(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId,
          policyId: warning.policyId, expectedRevision: 1, maximumQuantity: "95", action: "warning", status: "active" }),
      ]);
      expect(concurrent.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(concurrent.filter(result => result.status === "rejected")).toHaveLength(1);
      expect(concurrent.find(result => result.status === "rejected")?.reason).toBeInstanceOf(BudgetPolicyConflict);
      const disabled = await reviseBudgetPolicy(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId,
        policyId: warning.policyId, expectedRevision: 2, maximumQuantity: "90", action: "warning", status: "disabled" });
      expect(disabled.revision).toBe(3);
      const afterDisable = await readBudgetPolicies(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId, productId: product, meter });
      expect(afterDisable).toHaveLength(8);
      expect(projectActiveBudgetPoliciesV1(operation, afterDisable).map(policy => policy.policyId)).not.toContain(warning.policyId);
      expect(projectActiveBudgetPoliciesV1(operation, afterDisable).map(policy => policy.policyId)).toContain(stop.policyId);
      expect((await admin.query("SELECT revision,maximum_quantity,status FROM budget_policy_revisions WHERE budget_policy_id=$1 ORDER BY revision", [warning.policyId])).rows)
        .toEqual([{ revision: 1, maximum_quantity: "80", status: "active" },
          { revision: 2, maximum_quantity: expect.any(String), status: "active" },
          { revision: 3, maximum_quantity: "90", status: "disabled" }]);

      await expect(createBudgetPolicy(runtimeUrl.toString(), { ...base, actorUserId: bob,
        maximumQuantity: "1", action: "hard_stop", status: "active" })).rejects.toBeInstanceOf(BudgetPolicyDenied);
      await expect(readBudgetPolicies(runtimeUrl.toString(), { actorUserId: bob, organizationId: org.organizationId, productId: product, meter }))
        .rejects.toBeInstanceOf(BudgetPolicyDenied);
      expect(await readBudgetPolicies(runtimeUrl.toString(), { actorUserId: bob,
        organizationId: other.organizationId, productId: product, meter })).toEqual([]);
      await expect(createBudgetPolicy(runtimeUrl.toString(), { ...base, meter: { ...meter, meterVersion: 2 },
        maximumQuantity: "1", action: "hard_stop", status: "active" })).rejects.toBeInstanceOf(BudgetPolicyInvalid);
      await expect(createBudgetPolicy(runtimeUrl.toString(), { ...base, scope: { kind: "team", teamId: createCanonicalId("team") },
        maximumQuantity: "1", action: "hard_stop", status: "active" })).rejects.toBeInstanceOf(BudgetPolicyDenied);
      await expect(createBudgetPolicy(runtimeUrl.toString(), { ...base, scope: { kind: "capability", capabilityKey: "unknown" },
        maximumQuantity: "1", action: "hard_stop", status: "active" })).rejects.toBeInstanceOf(BudgetPolicyInvalid);
      await expect(reviseBudgetPolicy(runtimeUrl.toString(), { actorUserId: alice, organizationId: other.organizationId,
        policyId: warning.policyId, expectedRevision: 3, maximumQuantity: "1", action: "warning", status: "active" }))
        .rejects.toBeInstanceOf(BudgetPolicyDenied);
      expect((await admin.query("SELECT count(*)::int AS count FROM identity_audit_events WHERE target_id=$1", [warning.policyId])).rows[0]!.count).toBe(3);
      const auditBlock = `budget_audit_block_${suffix}`;
      await admin.query(`CREATE FUNCTION public.${auditBlock}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.target_id='${warning.policyId}' AND NEW.action='budget.policy.revised' THEN
          RAISE EXCEPTION 'fixture audit failure';
        END IF;
        RETURN NEW;
      END $$`);
      await admin.query(`CREATE TRIGGER ${auditBlock} BEFORE INSERT ON identity_audit_events
        FOR EACH ROW EXECUTE FUNCTION public.${auditBlock}()`);
      try {
        await expect(reviseBudgetPolicy(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId,
          policyId: warning.policyId, expectedRevision: 3, maximumQuantity: "91", action: "warning", status: "active" }))
          .rejects.toThrow("fixture audit failure");
        expect((await admin.query("SELECT max(revision)::int AS revision FROM budget_policy_revisions WHERE budget_policy_id=$1",
          [warning.policyId])).rows[0]!.revision).toBe(3);
      } finally {
        await admin.query(`DROP TRIGGER ${auditBlock} ON identity_audit_events`);
        await admin.query(`DROP FUNCTION public.${auditBlock}()`);
      }
      const restored = await reviseBudgetPolicy(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId,
        policyId: warning.policyId, expectedRevision: 3, maximumQuantity: "91", action: "warning", status: "active" });
      expect(restored.revision).toBe(4);
      await admin.query("UPDATE products SET catalog_metadata=NULL WHERE id=$1", [product]);
      const retired = await reviseBudgetPolicy(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId,
        policyId: warning.policyId, expectedRevision: 4, maximumQuantity: "91", action: "warning", status: "disabled" });
      expect(retired.revision).toBe(5);
      await expect(reviseBudgetPolicy(runtimeUrl.toString(), { actorUserId: alice, organizationId: org.organizationId,
        policyId: warning.policyId, expectedRevision: 5, maximumQuantity: "92", action: "warning", status: "active" }))
        .rejects.toBeInstanceOf(BudgetPolicyInvalid);
    } finally {
      await admin.query(`DROP ROLE ${roleName}`);
      await admin.end();
    }
  });
});
