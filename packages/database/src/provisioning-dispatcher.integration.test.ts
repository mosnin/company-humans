import { randomBytes } from "node:crypto";
import { assertProductAdapterV1, PRODUCT_ADAPTER_METHODS, type AdapterMutation, type ProductAdapterV1 } from "@company-human/contracts";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { enableProductInstance } from "./product-instances.js";
import { dispatchProvisioningOperation } from "./provisioning-dispatcher.js";
import { referenceProductId } from "./seed.js";

const databaseUrl = process.env.DATABASE_URL;
function fixtureAdapter(provisionOrganization: ProductAdapterV1["provisionOrganization"]): ProductAdapterV1 {
  const adapter = { contractVersion: 1, ...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(name =>
    [name, async () => { throw new Error(`Unexpected fixture call: ${name}`); }])), provisionOrganization };
  assertProductAdapterV1(adapter);
  return adapter;
}

describe.skipIf(!databaseUrl)("restricted provider dispatcher", () => {
  it("binds product and tenant, activates atomically, and refuses stale or revoked authority", async () => {
    const suffix = randomBytes(6).toString("hex");
    const serviceRole = `ch_dispatch_service_${suffix}`;
    const workerRole = `ch_dispatch_worker_${suffix}`;
    const password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    for (const [role, grant] of [[serviceRole, "company_human_service"], [workerRole, "company_human_provisioner"]]) {
      await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
      await admin.query(`GRANT ${grant} TO ${role}`);
    }
    const service = new URL(databaseUrl!); service.username = serviceRole; service.password = password;
    const worker = new URL(service); worker.username = workerRole;
    const alice = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `dispatcher_${suffix}`, primaryEmail: null, displayName: "Alice", status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `dispatcher-${suffix}`, name: "Dispatcher fixture" });
    const scope = { actorUserId: alice, organizationId: org.organizationId };
    const scalar = referenceProductId("scalar");
    const cadre = referenceProductId("cadre");
    const calls: AdapterMutation[] = [];
    const sql = new Client({ connectionString: worker.toString() }); await sql.connect();
    const serviceSql = new Client({ connectionString: service.toString() }); await serviceSql.connect();
    try {
      const instance = await enableProductInstance(service.toString(), { ...scope, productId: scalar, mode: "provisioned" });
      const adapter = fixtureAdapter(async input => { calls.push(input); return { status: "succeeded", value: { externalOrganizationId: "fixture-scalar-org", status: "active" } }; });
      await expect(dispatchProvisioningOperation(service.toString(), scope, { productId: scalar, adapter })).rejects.toThrow("restricted provisioner role");
      expect(await dispatchProvisioningOperation(worker.toString(), scope, { productId: cadre, adapter })).toBe("idle");
      expect(calls).toHaveLength(0);
      await expect(serviceSql.query("SELECT company_human_private.activate_provisioned_instance($1,$2,$3)",
        ["ch_op_00000000000000000000000000000000", "00000000-0000-0000-0000-000000000000", "forged"])).rejects.toThrow("permission denied");
      await expect(sql.query("UPDATE product_instances SET provisioning_status = 'active' WHERE id = $1", [instance])).rejects.toThrow("permission denied");
      await expect(sql.query("UPDATE memberships SET status = 'active' WHERE organization_id = $1", [org.organizationId])).rejects.toThrow("permission denied");
      expect(await dispatchProvisioningOperation(worker.toString(), scope, { productId: scalar, adapter })).toBe("processed");
      expect(calls).toEqual([{ organizationId: org.organizationId, productInstanceId: instance, idempotencyKey: `${instance}:provision:v1` }]);
      expect((await admin.query("SELECT provisioning_status,external_organization_id FROM product_instances WHERE id = $1", [instance])).rows)
        .toEqual([{ provisioning_status: "active", external_organization_id: "fixture-scalar-org" }]);
      expect((await admin.query("SELECT status FROM provisioning_operations WHERE product_instance_id = $1", [instance])).rows).toEqual([{ status: "succeeded" }]);
      expect(await dispatchProvisioningOperation(worker.toString(), scope, { productId: scalar, adapter })).toBe("idle");
      expect(calls).toHaveLength(1);
      // Disabling during the call prevents activation but retains the remote receipt for reconciliation.
      const revoked = await enableProductInstance(service.toString(), { ...scope, productId: scalar, instanceKey: "revoked", mode: "provisioned" });
      const disabling = fixtureAdapter(async () => {
        await admin.query("UPDATE product_instances SET desired_enabled = false WHERE id = $1", [revoked]);
        return { status: "succeeded", value: { externalOrganizationId: "must-not-bind", status: "active" } };
      });
      expect(await dispatchProvisioningOperation(worker.toString(), scope, { productId: scalar, adapter: disabling })).toBe("processed");
      expect((await admin.query("SELECT status FROM provisioning_operations WHERE product_instance_id = $1", [revoked])).rows).toEqual([{ status: "failed" }]);
      expect((await admin.query("SELECT external_organization_id FROM product_instances WHERE id = $1", [revoked])).rows[0].external_organization_id).toBeNull();
      // Provider exceptions are normalized and remain retryable; sensitive error text is discarded.
      const failed = await enableProductInstance(service.toString(), { ...scope, productId: scalar, instanceKey: "transport", mode: "provisioned" });
      await dispatchProvisioningOperation(worker.toString(), scope, { productId: scalar, adapter: fixtureAdapter(async () => { throw new Error("sensitive-fixture-token"); }) });
      expect((await admin.query("SELECT status,failure_code FROM provisioning_operations WHERE product_instance_id = $1", [failed])).rows)
        .toEqual([{ status: "retry_wait", failure_code: "adapter_transport_failure" }]);
      // Invalid provider status never becomes active.
      const inactive = await enableProductInstance(service.toString(), { ...scope, productId: scalar, instanceKey: "inactive", mode: "provisioned" });
      await dispatchProvisioningOperation(worker.toString(), scope, { productId: scalar,
        adapter: fixtureAdapter(async () => ({ status: "succeeded", value: { externalOrganizationId: "inactive-fixture", status: "suspended" } })) });
      expect((await admin.query("SELECT status,failure_code FROM provisioning_operations WHERE product_instance_id = $1", [inactive])).rows)
        .toEqual([{ status: "failed", failure_code: "provider_organization_not_active" }]);
      // Async provisioning is retried with the same key, then activated only on a confirmed active result.
      const pending = await enableProductInstance(service.toString(), { ...scope, productId: scalar, instanceKey: "pending", mode: "provisioned" });
      const pendingCalls: AdapterMutation[] = [];
      const pendingAdapter = fixtureAdapter(async input => {
        pendingCalls.push(input);
        return pendingCalls.length === 1 ? { status: "pending", operationId: "fixture-provider-job" }
          : { status: "succeeded", value: { externalOrganizationId: "fixture-async-org", status: "active" } };
      });
      await dispatchProvisioningOperation(worker.toString(), scope, { productId: scalar, adapter: pendingAdapter });
      expect((await admin.query("SELECT provisioning_status FROM product_instances WHERE id = $1", [pending])).rows[0].provisioning_status).toBe("pending");
      await admin.query("UPDATE provisioning_operations SET next_attempt_at = now() - interval '1 second' WHERE product_instance_id = $1", [pending]);
      await dispatchProvisioningOperation(worker.toString(), scope, { productId: scalar, adapter: pendingAdapter });
      expect(pendingCalls).toHaveLength(2);
      expect(pendingCalls[0]).toEqual(pendingCalls[1]);
      expect((await admin.query("SELECT external_organization_id FROM product_instances WHERE id = $1", [pending])).rows[0].external_organization_id).toBe("fixture-async-org");
      // Permission loss after an external call prevents a receipt and local activation.
      const suspended = await enableProductInstance(service.toString(), { ...scope, productId: scalar, instanceKey: "suspended", mode: "provisioned" });
      const suspending = fixtureAdapter(async () => {
        await admin.query("UPDATE memberships SET status = 'suspended' WHERE organization_id = $1", [org.organizationId]);
        return { status: "succeeded", value: { externalOrganizationId: "must-not-bind", status: "active" } };
      });
      expect(await dispatchProvisioningOperation(worker.toString(), scope, { productId: scalar, adapter: suspending })).toBe("processed");
      expect((await admin.query("SELECT external_organization_id FROM product_instances WHERE id = $1", [suspended])).rows[0].external_organization_id).toBeNull();
      for(const target of [revoked,suspended]){
        const result=(await admin.query("SELECT status,failure_code,provider_reference FROM provisioning_operations WHERE product_instance_id=$1",[target])).rows[0];
        expect(result).toEqual({status:'failed',failure_code:'activation_denied_reconciliation_required',provider_reference:'must-not-bind'});
        expect((await admin.query("SELECT a.outcome,a.provider_reference FROM provisioning_attempts a JOIN provisioning_operations o ON o.id=a.operation_id WHERE o.product_instance_id=$1",[target])).rows[0]).toEqual({outcome:'succeeded',provider_reference:'must-not-bind'});
      }
      const workerEvents=(await admin.query("SELECT actor_type,actor_service_id,actor_user_id,after_state FROM identity_audit_events WHERE organization_id=$1 AND target_type='provisioning_operation'",[org.organizationId])).rows;
      expect(workerEvents.length).toBeGreaterThan(4);
      expect(workerEvents.every(e=>e.actor_type==='service'&&e.actor_service_id==='organization-provisioner'&&e.actor_user_id===null)).toBe(true);
      expect(workerEvents.filter(e=>e.after_state.code==='activation_denied_reconciliation_required').every(e=>e.after_state.instanceActivated===false)).toBe(true);
      await expect(dispatchProvisioningOperation(worker.toString(),scope,{productId:scalar,adapter})).rejects.toThrow('Application administration denied');
    } finally {
      await sql.end(); await serviceSql.end();
      for (const table of ["provisioning_attempts", "provisioning_operations", "product_instances", "identity_audit_events", "memberships", "roles"]) {
        await admin.query(`DELETE FROM ${table} WHERE organization_id = $1`, [org.organizationId]);
      }
      await admin.query("DELETE FROM organizations WHERE id = $1", [org.organizationId]);
      await admin.query("DELETE FROM users WHERE id = $1", [alice]);
      await admin.query(`DROP ROLE ${workerRole}`); await admin.query(`DROP ROLE ${serviceRole}`);
      await admin.end();
    }
  });
});
