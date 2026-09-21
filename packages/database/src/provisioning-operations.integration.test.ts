import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { enableProductInstance } from "./product-instances.js";
import { claimProvisioningOperation, finishProvisioningAttempt } from "./provisioning-operations.js";
import { referenceProductId } from "./seed.js";

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("durable provisioning journal", () => {
  it("fences concurrent workers, persists partial results, bounds retries and denies other tenants", async () => {
    const suffix = randomBytes(6).toString("hex");
    const role = `ch_provision_${suffix}`;
    const password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_service TO ${role}`);
    const runtime = new URL(databaseUrl!);
    runtime.username = role;
    runtime.password = password;
    const url = runtime.toString();
    const alice = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `provision_alice_${suffix}`, primaryEmail: null, displayName: "Alice", status: "active", eventTimestamp: 1 });
    const bob = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `provision_bob_${suffix}`, primaryEmail: null, displayName: "Bob", status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `provision-${suffix}`, name: "Provision test" });
    const scope = { organizationId: org.organizationId, actorUserId: alice };
    const sql = new Client({ connectionString: url });
    await sql.connect();
    try {
      const instance = await enableProductInstance(url, { ...scope, productId: referenceProductId("scalar"), mode: "provisioned" });
      const all = await Promise.all(Array.from({ length: 8 }, () => claimProvisioningOperation(url, scope)));
      expect(all.filter(Boolean)).toHaveLength(1);
      const first = all.find(Boolean)!;
      expect(first.productInstanceId).toBe(instance);
      await expect(claimProvisioningOperation(url, { ...scope, actorUserId: bob })).rejects.toThrow("Application administration denied");
      await expect(finishProvisioningAttempt(url, { ...scope, actorUserId: bob }, first.operationId, first.leaseToken,
        { status: "succeeded", providerReference: "forged" })).rejects.toThrow("Application administration denied");
      await enableProductInstance(url, { ...scope, productId: referenceProductId("scalar"), instanceKey: "connect-existing", mode: "connected" });
      expect(await claimProvisioningOperation(url, scope)).toBeNull();
      // A provider may create a resource before a worker crashes. Retry must keep its idempotency key.
      await admin.query("UPDATE provisioning_operations SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [first.operationId]);
      const recovered = (await claimProvisioningOperation(url, scope))!;
      expect(recovered.idempotencyKey).toBe(first.idempotencyKey);
      expect(recovered.leaseToken).not.toBe(first.leaseToken);
      await expect(finishProvisioningAttempt(url, scope, first.operationId, first.leaseToken,
        { status: "succeeded", providerReference: "late" })).rejects.toThrow("Stale provisioning lease");
      await finishProvisioningAttempt(url, scope, recovered.operationId, recovered.leaseToken,
        { status: "pending", providerReference: "provider-job-42" });
      expect(await claimProvisioningOperation(url, scope)).toBeNull();
      await sql.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)", [alice, org.organizationId]);
      const partial = await sql.query("SELECT status,provider_reference FROM provisioning_operations WHERE id = $1", [first.operationId]);
      expect(partial.rows).toEqual([{ status: "retry_wait", provider_reference: "provider-job-42" }]);
      await expect(sql.query("UPDATE provisioning_attempts SET outcome = 'succeeded' WHERE operation_id = $1 AND attempt_number = 1", [first.operationId])).rejects.toThrow("immutable");
      await expect(sql.query("DELETE FROM provisioning_operations WHERE id = $1", [first.operationId])).rejects.toThrow("permission denied");
      // Tenant denial is also enforced for raw SQL, independent of the service helper.
      await sql.query("SELECT set_config('company_human.user_id',$1,false)", [bob]);
      expect((await sql.query("SELECT id FROM provisioning_operations")).rows).toEqual([]);
      expect((await sql.query("SELECT operation_id FROM provisioning_attempts")).rows).toEqual([]);
      expect((await sql.query("UPDATE provisioning_operations SET status = 'failed' WHERE id = $1", [first.operationId])).rowCount).toBe(0);
      for (let attempt = 3; attempt <= 5; attempt++) {
        await admin.query("UPDATE provisioning_operations SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [first.operationId]);
        const lease = (await claimProvisioningOperation(url, scope))!;
        expect(lease.attemptNumber).toBe(attempt);
        expect(lease.idempotencyKey).toBe(first.idempotencyKey);
        await finishProvisioningAttempt(url, scope, lease.operationId, lease.leaseToken, { status: "retryable_failure", code: "provider_unavailable" });
      }
      expect(await claimProvisioningOperation(url, scope)).toBeNull();
      const end = await admin.query("SELECT status,failure_code,provider_reference,attempt_count FROM provisioning_operations WHERE id = $1", [first.operationId]);
      expect(end.rows).toEqual([{ status: "failed", failure_code: "retry_exhausted", provider_reference: "provider-job-42", attempt_count: 5 }]);
      expect((await admin.query("SELECT outcome FROM provisioning_attempts WHERE operation_id = $1 ORDER BY attempt_number", [first.operationId])).rows.map(r => r.outcome))
        .toEqual(["lease_expired", "pending", "retryable_failure", "retryable_failure", "retryable_failure"]);
      expect((await admin.query("SELECT provisioning_status FROM product_instances WHERE id = $1", [instance])).rows[0].provisioning_status).toBe("pending");
      // Permanent failures and successes are terminal; no false instance activation occurs.
      for (const outcome of ["permanent_failure", "succeeded"] as const) {
        await enableProductInstance(url, { ...scope, productId: referenceProductId("scalar"), instanceKey: outcome.replaceAll("_", "-"), mode: "provisioned" });
        const lease = (await claimProvisioningOperation(url, scope))!;
        await finishProvisioningAttempt(url, scope, lease.operationId, lease.leaseToken, outcome === "succeeded"
          ? { status: outcome, providerReference: "fixture-org" } : { status: outcome, code: "authentication_required" });
        await expect(finishProvisioningAttempt(url, scope, lease.operationId, lease.leaseToken,
          { status: "succeeded", providerReference: "duplicate" })).rejects.toThrow("Stale provisioning lease");
        expect(await claimProvisioningOperation(url, scope)).toBeNull();
      }
      // A worker that repeatedly crashes also consumes the finite attempt budget.
      await enableProductInstance(url, { ...scope, productId: referenceProductId("scalar"), instanceKey: "crash-loop", mode: "provisioned" });
      let crashedId = "";
      for (let attempt = 1; attempt <= 5; attempt++) {
        const crashed = (await claimProvisioningOperation(url, scope))!;
        crashedId = crashed.operationId;
        expect(crashed.attemptNumber).toBe(attempt);
        await admin.query("UPDATE provisioning_operations SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [crashedId]);
      }
      expect(await claimProvisioningOperation(url, scope)).toBeNull();
      expect((await admin.query("SELECT status,failure_code FROM provisioning_operations WHERE id = $1", [crashedId])).rows)
        .toEqual([{ status: "failed", failure_code: "retry_exhausted" }]);
      // Suspension after a claim revokes the authority to persist a receipt.
      await enableProductInstance(url, { ...scope, productId: referenceProductId("scalar"), instanceKey: "suspension", mode: "provisioned" });
      const suspendedLease = (await claimProvisioningOperation(url, scope))!;
      await admin.query("UPDATE memberships SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2", [org.organizationId, alice]);
      await expect(finishProvisioningAttempt(url, scope, suspendedLease.operationId, suspendedLease.leaseToken,
        { status: "succeeded", providerReference: "late" })).rejects.toThrow("Application administration denied");
    } finally {
      await sql.end();
      for (const table of ["provisioning_attempts", "provisioning_operations", "product_instances", "identity_audit_events", "memberships", "roles"]) {
        await admin.query(`DELETE FROM ${table} WHERE organization_id = $1`, [org.organizationId]);
      }
      await admin.query("DELETE FROM organizations WHERE id = $1", [org.organizationId]);
      await admin.query("DELETE FROM users WHERE id = ANY($1)", [[alice, bob]]);
      await admin.query(`DROP ROLE ${role}`);
      await admin.end();
    }
  });
});
