import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { AuditEnvelopeV1Schema, assertProductAdapterV2, PRODUCT_ADAPTER_METHODS, createCanonicalId, type ProductAdapterV2 } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { requestProductMembership } from "./product-memberships.js";
import { disableProductInstance } from "./product-instances.js";
import { appendServiceAudit } from "./identity-audit.js";
import { referenceProductId } from "./seed.js";
import { claimMemberBootstrap, finishMemberBootstrap, dispatchMemberBootstrap } from "./member-bootstrap-worker.js";
const databaseUrl = process.env.DATABASE_URL;
function adapter(provisionMember: ProductAdapterV2["provisionMember"]): ProductAdapterV2 {
  const value = { contractVersion: 2, ...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(name => [name, async () => { throw new Error(`Unexpected fixture ${name}`); }])), provisionMember };
  assertProductAdapterV2(value); return value;
}
const suspended = { status: "succeeded", value: { externalMemberId: "fixture-suspended", status: "suspended" } } as const;
describe.skipIf(!databaseUrl)("durable suspended member bootstrap", () => {
  it("scopes claims, retains suspended receipts without granting access, rejects stale work and enforces restricted audit", async () => {
    const suffix = randomBytes(6).toString("hex"), password = randomBytes(20).toString("hex");
    const serviceRole = `ch_boot_service_${suffix}`, workerRole = `ch_boot_worker_${suffix}`;
    const admin = new Client({ connectionString: databaseUrl }); await admin.connect();
    for (const [role, grant] of [[serviceRole, "company_human_service"], [workerRole, "company_human_bootstrap_worker"]]) {
      await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`); await admin.query(`GRANT ${grant} TO ${role}`);
    }
    const service = new URL(databaseUrl!); service.username = serviceRole; service.password = password;
    const worker = new URL(service); worker.username = workerRole;
    const owner = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `bootstrap-${suffix}`, displayName: "Bootstrap fixture", primaryEmail: null, status: "active", eventTimestamp: 1 });
    const org = await createOrganization(databaseUrl!, { ownerUserId: owner, name: "Bootstrap fixture", slug: `bootstrap-${suffix}` });
    const foreign = await createOrganization(databaseUrl!, { ownerUserId: owner, name: "Other fixture", slug: `bootstrap-other-${suffix}` });
    const fixtureUsers = [owner];
    const orgIds = [org.organizationId, foreign.organizationId], product = createCanonicalId("product");
    const member = (await admin.query("SELECT id FROM memberships WHERE organization_id=$1", [org.organizationId])).rows[0].id;
    async function setup(key: string) {
      const instance = createCanonicalId("productInstance");
      await admin.query(`INSERT INTO product_instances (id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id)
        VALUES ($1,$2,$3,$4,'connected','active',$5,$6)`, [instance, org.organizationId, product, key, `fixture-${key}-${suffix}`, owner]);
      const mapping = await requestProductMembership(service.toString(), { actorUserId: owner, organizationId: org.organizationId, productInstanceId: instance, membershipId: member });
      return { instance, mapping };
    }
    const claim = () => claimMemberBootstrap(worker.toString(), org.organizationId, product);
    const finish = (lease: NonNullable<Awaited<ReturnType<typeof claim>>>) => finishMemberBootstrap(worker.toString(), org.organizationId, lease, suspended);
    const sql = new Client({ connectionString: worker.toString() }); await sql.connect();
    try {
      await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Bootstrap fixture','ready',$3)",
        [product,`bootstrap-${suffix}`,{schemaVersion:1,description:'Test only',category:'sales',supportedCapabilities:[],
          provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:[],requiredPermissions:['product.use'],
          adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:[]}]);
      const first = await setup("first");
      await expect(claimMemberBootstrap(service.toString(), org.organizationId, product)).rejects.toThrow("restricted worker");
      await expect(claimMemberBootstrap(databaseUrl!, org.organizationId, product)).rejects.toThrow("restricted worker");
      expect(await claimMemberBootstrap(worker.toString(), foreign.organizationId, product)).toBeNull();
      expect(await claimMemberBootstrap(worker.toString(), org.organizationId, referenceProductId("cadre"))).toBeNull();
      // V1 is rejected before claiming a job or contacting the product.
      const old = { ...adapter(async () => suspended), contractVersion: 1 };
      await expect(dispatchMemberBootstrap(worker.toString(), org.organizationId, { productId: product, adapter: old as unknown as ProductAdapterV2 })).rejects.toThrow("version 2");
      expect((await admin.query("SELECT * FROM member_bootstrap_jobs WHERE organization_id=$1", [org.organizationId])).rowCount).toBe(0);
      const claims = await Promise.all(Array.from({ length: 6 }, claim));
      expect(claims.filter(Boolean)).toHaveLength(1); const lease = claims.find(Boolean)!;
      expect(lease.operation).toBe("provisionMember"); expect(lease.idempotencyKey).toBe(`${first.mapping}:member:1`);
      await expect(finishMemberBootstrap(worker.toString(), foreign.organizationId, lease, suspended)).rejects.toThrow("Stale");
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)", [org.organizationId]);
      await expect(sql.query("SELECT company_human_private.bind_suspended_product_member($1,$2)", [lease.commandId, lease.leaseToken])).rejects.toThrow("receipt required");
      expect((await sql.query("SELECT pg_has_role(current_user,'company_human_member_binding','member') AS owns")).rows[0].owns).toBe(false);
      const serviceSql = new Client({ connectionString: service.toString() }); await serviceSql.connect();
      try {
        await expect(serviceSql.query("SELECT company_human_private.bind_suspended_product_member($1,$2)", [lease.commandId, lease.leaseToken])).rejects.toThrow("permission denied");
      } finally { await serviceSql.end(); }
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)", [foreign.organizationId]);
      await expect(sql.query("SELECT company_human_private.bind_suspended_product_member($1,$2)", [lease.commandId, lease.leaseToken])).rejects.toThrow("Stale");
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)", [org.organizationId]);
      // Audit and receipt are a single transaction.
      const guard = `boot_audit_failure_${suffix}`;
      await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.target_id='${lease.commandId}' AND NEW.action='product.member_bootstrap.received' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
      try {
        await expect(finish(lease)).rejects.toThrow("fixture audit failure");
        expect((await admin.query("SELECT status FROM member_bootstrap_jobs WHERE command_id=$1", [lease.commandId])).rows[0].status).toBe("running");
        expect((await admin.query("SELECT external_member_id FROM product_memberships WHERE id=$1", [first.mapping])).rows[0].external_member_id).toBeNull();
        expect((await admin.query("SELECT count(*)::int AS n FROM identity_audit_events WHERE target_id=$1 AND action='product.member_bootstrap.bound'", [lease.commandId])).rows[0].n).toBe(0);
        expect((await admin.query("SELECT finished_at FROM member_bootstrap_attempts WHERE command_id=$1", [lease.commandId])).rows[0].finished_at).toBeNull();
      } finally { await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`); await admin.query(`DROP FUNCTION public.${guard}()`); }
      await finishMemberBootstrap(worker.toString(), org.organizationId, lease, { status: "pending", operationId: "fixture-pending" });
      expect(await claim()).toBeNull();
      await admin.query("UPDATE member_bootstrap_jobs SET next_attempt_at=now()-interval '1 second' WHERE command_id=$1", [lease.commandId]);
      const retried = (await claim())!;
      expect(retried.idempotencyKey).toBe(lease.idempotencyKey); expect(retried.attemptNumber).toBe(2);
      await expect(finish(lease)).rejects.toThrow("Stale"); await finish(retried);
      expect((await admin.query("SELECT status,provider_reference FROM member_bootstrap_jobs WHERE command_id=$1", [lease.commandId])).rows[0]).toEqual({ status: "succeeded", provider_reference: "fixture-suspended" });
      expect((await admin.query("SELECT provisioning_status,external_member_id FROM product_memberships WHERE id=$1", [first.mapping])).rows[0]).toEqual({ provisioning_status: "suspended", external_member_id: "fixture-suspended" });
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)", [org.organizationId]);
      await expect(sql.query("UPDATE product_memberships SET provisioning_status='active' WHERE id=$1", [first.mapping])).rejects.toThrow("permission denied");
      await expect(sql.query("UPDATE memberships SET status='active' WHERE id=$1", [member])).rejects.toThrow("permission denied");
      await expect(sql.query("SELECT primary_email FROM users")).rejects.toThrow("permission denied");
      await expect(sql.query("DELETE FROM member_bootstrap_attempts WHERE command_id=$1", [lease.commandId])).rejects.toThrow("permission denied");
      await expect(sql.query("UPDATE member_bootstrap_attempts SET outcome='permanent_failure' WHERE command_id=$1", [lease.commandId])).rejects.toThrow("immutable");
      await expect(appendServiceAudit(sql, { organizationId: org.organizationId, serviceId: "forged", action: "product.member_bootstrap.claimed", targetType: "product_membership_command", targetId: lease.commandId, afterState: {} })).rejects.toThrow();
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)", [foreign.organizationId]);
      expect((await sql.query("SELECT * FROM member_bootstrap_jobs WHERE command_id=$1", [lease.commandId])).rowCount).toBe(0);
      await expect(sql.query("INSERT INTO member_bootstrap_jobs (command_id,organization_id) VALUES ($1,$2)", [createCanonicalId("provisioningOperation"), org.organizationId])).rejects.toThrow();
      const events = (await admin.query("SELECT actor_type,actor_service_id,envelope,after_state FROM identity_audit_events WHERE target_id=$1", [lease.commandId])).rows;
      expect(events).toHaveLength(5);
      for (const event of events) AuditEnvelopeV1Schema.parse(event.envelope);
      expect(JSON.stringify(events)).not.toContain("fixture-suspended");
      const provenance = (await admin.query("SELECT provider_receipt_reference,provisioned_at FROM product_memberships WHERE id=$1", [first.mapping])).rows[0];
      expect(provenance.provider_receipt_reference).toBe(`${lease.commandId}:attempt:2`); expect(provenance.provisioned_at).not.toBeNull();
      await sql.query("SELECT set_config('company_human.organization_id',$1,false)", [org.organizationId]);
      await expect(sql.query("SELECT company_human_private.bind_suspended_product_member($1,$2)", [retried.commandId, retried.leaseToken])).rejects.toThrow("Stale");
      // A second canonical member cannot claim the same provider identity in an instance.
      const otherUser = await syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `bootstrap-other-${suffix}`, displayName: "Collision fixture", primaryEmail: null, status: "active", eventTimestamp: 1 });
      fixtureUsers.push(otherUser); const otherMember = createCanonicalId("membership");
      await admin.query("INSERT INTO memberships (id,organization_id,user_id,status,role_key) VALUES ($1,$2,$3,'active','contributor')", [otherMember, org.organizationId, otherUser]);
      const collision = await requestProductMembership(service.toString(), { actorUserId: owner, organizationId: org.organizationId, productInstanceId: first.instance, membershipId: otherMember });
      const collisionLease = (await claim())!; await finish(collisionLease);
      expect((await admin.query("SELECT status,failure_code,provider_reference FROM member_bootstrap_jobs WHERE command_id=$1", [collisionLease.commandId])).rows[0]).toEqual({ status: "failed", failure_code: "provider_binding_rejected", provider_reference: "fixture-suspended" });
      expect((await admin.query("SELECT external_member_id,provisioning_status FROM product_memberships WHERE id=$1", [collision])).rows[0]).toEqual({ external_member_id: null, provisioning_status: "pending" });
      expect(events.every(e => e.actor_type === "service" && e.actor_service_id === "member-bootstrap-worker")).toBe(true);
      // The dispatcher sends explicit initial denial, never resume/access operations.
      await setup("dispatch"); let called = false;
      await dispatchMemberBootstrap(worker.toString(), org.organizationId, { productId: product, adapter: adapter(async input => {
        called = true; expect(input.initialAccess).toBe("suspended"); expect(input.organizationId).toBe(org.organizationId); return suspended;
      }) }); expect(called).toBe(true);
      const invalid = await setup("active-response");
      await dispatchMemberBootstrap(worker.toString(), org.organizationId, { productId: product, adapter: adapter(async () => ({ status: "succeeded", value: { externalMemberId: "wrong", status: "active" } }) as unknown as Awaited<ReturnType<ProductAdapterV2["provisionMember"]>>) });
      expect((await admin.query("SELECT failure_code FROM member_bootstrap_jobs j JOIN product_membership_commands c ON c.id=j.command_id WHERE c.product_membership_id=$1", [invalid.mapping])).rows[0].failure_code).toBe("invalid_adapter_response");
      await setup("transport");
      await dispatchMemberBootstrap(worker.toString(), org.organizationId, { productId: product, adapter: adapter(async () => { throw new Error("secret-do-not-persist"); }) });
      expect((await admin.query("SELECT failure_code FROM member_bootstrap_jobs WHERE organization_id=$1 AND status='retry_wait'", [org.organizationId])).rows).toEqual([{ failure_code: "adapter_transport_failure" }]);
      await admin.query("UPDATE member_bootstrap_jobs SET status='failed' WHERE organization_id=$1 AND status='retry_wait'", [org.organizationId]);
      // Revocation while the remote call is outstanding retains its receipt for reconciliation.
      const revoked = await setup("revoked"); const oldLease = (await claim())!;
      await disableProductInstance(service.toString(), { actorUserId: owner, organizationId: org.organizationId, productInstanceId: revoked.instance });
      await finish(oldLease);
      expect((await admin.query("SELECT status,provider_reference FROM member_bootstrap_jobs WHERE command_id=$1", [oldLease.commandId])).rows[0]).toEqual({ status: "superseded", provider_reference: "fixture-suspended" });
      expect((await admin.query("SELECT external_member_id FROM product_memberships WHERE id=$1", [revoked.mapping])).rows[0].external_member_id).toBeNull();
      // Every identity layer is rechecked before a claim, and a revoked target cannot finish current work.
      await setup("inactive-target");
      for (const [table, id, status] of [["memberships", member, "suspended"], ["users", owner, "deleted"]]) {
        await admin.query(`UPDATE ${table} SET status=$2 WHERE id=$1`, [id, status]); expect(await claim()).toBeNull();
        await admin.query(`UPDATE ${table} SET status='active' WHERE id=$1`, [id]);
      }
      // Fixture owner sets organization suspension; no application API can do this yet.
      // DDL locks and a single transaction keep the guard enabled for other connections.
      async function fixtureOrganizationStatus(status: string) {
        await admin.query("BEGIN");
        try {
          await admin.query("ALTER TABLE organizations DISABLE TRIGGER service_update_guard");
          await admin.query("UPDATE organizations SET status=$2 WHERE id=$1", [org.organizationId, status]);
          await admin.query("ALTER TABLE organizations ENABLE TRIGGER service_update_guard");
          await admin.query("COMMIT");
        } catch (error) { await admin.query("ROLLBACK"); throw error; }
      }
      await fixtureOrganizationStatus("suspended"); expect(await claim()).toBeNull();
      await fixtureOrganizationStatus("active");
      expect(await claim()).toBeNull(); // Reactivation does not restore revoked product enable intent.
      await setup("fresh-after-reactivation");
      const activeLease = (await claim())!;
      await admin.query("UPDATE memberships SET status='removed' WHERE id=$1", [member]); await finish(activeLease);
      expect((await admin.query("SELECT status FROM member_bootstrap_jobs WHERE command_id=$1", [activeLease.commandId])).rows[0].status).toBe("superseded");
      await admin.query("UPDATE memberships SET status='active' WHERE id=$1", [member]);
      // Crash recovery preserves the provider key and cannot retry forever.
      await setup("crashed"); let crash = (await claim())!; const key = crash.idempotencyKey;
      for (let attempt = 2; attempt <= 5; attempt++) {
        await admin.query("UPDATE member_bootstrap_jobs SET lease_expires_at=now()-interval '1 second' WHERE command_id=$1", [crash.commandId]);
        await expect(finish(crash)).rejects.toThrow("Stale"); crash = (await claim())!;
        expect(crash.attemptNumber).toBe(attempt); expect(crash.idempotencyKey).toBe(key);
      }
      await finishMemberBootstrap(worker.toString(), org.organizationId, crash, { status: "retryable_failure", code: "provider_down" });
      expect((await admin.query("SELECT status,failure_code FROM member_bootstrap_jobs WHERE command_id=$1", [crash.commandId])).rows[0]).toEqual({ status: "failed", failure_code: "retry_exhausted" });
      expect(await claim()).toBeNull();
    } finally {
      await sql.end();
      for (const table of ["member_denial_attempts", "member_denial_jobs", "member_bootstrap_attempts", "member_bootstrap_jobs", "product_membership_commands", "product_memberships", "identity_audit_events", "product_instances", "memberships", "roles"]) await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`, [orgIds]);
      await admin.query("DELETE FROM organizations WHERE id=ANY($1)", [orgIds]); await admin.query("DELETE FROM users WHERE id=ANY($1)", [fixtureUsers]);
      await admin.query("DELETE FROM products WHERE id=$1", [product]);
      for (const role of [serviceRole, workerRole]) await admin.query(`DROP ROLE ${role}`); await admin.end();
    }
  });
});
