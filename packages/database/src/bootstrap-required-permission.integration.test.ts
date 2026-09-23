import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { assertProductAdapterV2, createCanonicalId, PRODUCT_ADAPTER_METHODS, type Capability, type ProductAdapterV2 } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { requestProductMembership } from "./product-memberships.js";
import { setRolePermissions } from "./role-permissions.js";
import { claimMemberBootstrap, dispatchMemberBootstrap, finishMemberBootstrap } from "./member-bootstrap-worker.js";

const url = process.env.DATABASE_URL;
const receipt = (externalMemberId: string) => ({ status: "succeeded" as const, value: { externalMemberId, status: "suspended" as const } });
function adapter(call: ProductAdapterV2["provisionMember"]): ProductAdapterV2 {
  const value = { contractVersion: 2, ...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(method => [method, async () => { throw new Error(`Unexpected ${method}`); }])), provisionMember: call };
  assertProductAdapterV2(value); return value;
}

it.skipIf(!url)("bootstrap refuses missing permissions and blocked mappings before provider work and at receipt", async () => {
  const admin = new Client({ connectionString: url }); await admin.connect();
  const suffix = randomBytes(6).toString("hex"), password = randomBytes(20).toString("hex");
  const workerRole = `ch_auth_boot_${suffix}`, serviceRole = `ch_auth_service_${suffix}`, appRole = `ch_auth_app_${suffix}`;
  for (const [role, parent] of [[workerRole, "company_human_bootstrap_worker"], [serviceRole, "company_human_service"], [appRole, "company_human_app"]]) {
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT ${parent} TO ${role}`);
  }
  const endpoint = (role: string) => { const result = new URL(url!); result.username = role; result.password = password; return result.toString(); };
  const worker = endpoint(workerRole), service = endpoint(serviceRole);
  const owner = await syncAuthUser(url!, { authIssuer: "https://bootstrap-auth.test", authSubject: `owner-${suffix}`, displayName: "Owner", primaryEmail: null, status: "active", eventTimestamp: 1 });
  const memberUser = await syncAuthUser(url!, { authIssuer: "https://bootstrap-auth.test", authSubject: `member-${suffix}`, displayName: "Member", primaryEmail: null, status: "active", eventTimestamp: 1 });
  const a = await createOrganization(url!, { ownerUserId: owner, name: "Bootstrap A", slug: `bootstrap-auth-a-${suffix}` });
  const b = await createOrganization(url!, { ownerUserId: owner, name: "Bootstrap B", slug: `bootstrap-auth-b-${suffix}` });
  const orgs = [a.organizationId, b.organizationId];
  const product = createCanonicalId("product");
  const required = { schemaVersion: 1, description: "Fixture", category: "sales", supportedCapabilities: [], provisioningModes: ["connected"], supportedMemberOperations: ["provision", "suspend"], usageMeters: [], requiredPermissions: ["product.use", "billing.read.all"], adapterVersion: "1.0.0", billingBehavior: "organization_sponsored", deepLinks: {}, connectionRequirements: [] };
  const memberships = new Map<string, string>(), instances = new Map<string, string>(), roles = new Map<string, string>();
  const grants = async (role: string) => (await admin.query<{ permission_key: Capability }>("SELECT permission_key FROM role_permissions WHERE role_id=$1 ORDER BY permission_key", [role])).rows.map(row => row.permission_key);
  const set = async (org: string, desired: Capability[]) => setRolePermissions(service, { actorUserId: owner, organizationId: org, roleId: roles.get(org)!, capabilities: desired, expectedCapabilities: await grants(roles.get(org)!) });
  const makeMapping = async (org: string) => requestProductMembership(service, { actorUserId: owner, organizationId: org, productInstanceId: instances.get(org)!, membershipId: memberships.get(org)! });
  let calls = 0;
  const tracking = adapter(async input => { calls++; expect(input.initialAccess).toBe("suspended"); return receipt(`provider-${calls}`); });
  try {
    await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Bootstrap auth fixture','ready',$3)", [product, `bootstrap-auth-${suffix}`, required]);
    for (const org of orgs) {
      const role = (await admin.query("SELECT id FROM roles WHERE organization_id=$1 AND key='contributor'", [org])).rows[0].id as string;
      roles.set(org, role); await set(org, [...await grants(role), "billing.read.all"]);
      const membership = createCanonicalId("membership"), instance = createCanonicalId("productInstance");
      memberships.set(org, membership); instances.set(org, instance);
      await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')", [membership, org, memberUser]);
      await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'main','connected','active',$2,$4)", [instance, org, product, owner]);
    }
    const workerSql = new Client({ connectionString: worker }); await workerSql.connect();
    try {
      await workerSql.query("SELECT set_config('company_human.organization_id',$1,false)", [a.organizationId]);
      expect((await workerSql.query<{ missing: string | null }>("SELECT company_human_private.bootstrap_missing_product_permission($1,$2,$3) missing", [a.organizationId, roles.get(a.organizationId), product])).rows[0]?.missing).toBeNull();
      expect((await workerSql.query("SELECT role_id FROM memberships WHERE id=$1", [memberships.get(a.organizationId)])).rows[0]?.role_id).toBe(roles.get(a.organizationId));
      await expect(workerSql.query("SELECT company_human_private.bootstrap_missing_product_permission($1,$2,$3)", [b.organizationId, roles.get(b.organizationId), product])).rejects.toThrow("Bootstrap authorization tenant mismatch");
      await expect(workerSql.query("SELECT company_human_private.missing_product_permission($1,$2,$3)", [a.organizationId, roles.get(a.organizationId), product])).rejects.toThrow("permission denied");
      await expect(workerSql.query("SELECT primary_email FROM users")).rejects.toThrow("permission denied");
    } finally { await workerSql.end(); }
    for (const runtimeRole of [serviceRole, appRole]) {
      const client = new Client({ connectionString: endpoint(runtimeRole) }); await client.connect();
      try { await expect(client.query("SELECT company_human_private.missing_product_permission($1,$2,$3)", [a.organizationId, roles.get(a.organizationId), product])).rejects.toThrow("permission denied"); }
      finally { await client.end(); }
    }
    const first = await makeMapping(a.organizationId);
    await set(a.organizationId, (await grants(roles.get(a.organizationId)!)).filter(key => key !== "billing.read.all"));
    expect(await dispatchMemberBootstrap(worker, a.organizationId, { productId: product, adapter: tracking })).toBe("idle");
    expect(calls).toBe(0);
    expect((await admin.query("SELECT count(*)::int n FROM member_bootstrap_jobs WHERE organization_id=$1", [a.organizationId])).rows[0].n).toBe(0);
    expect((await admin.query("SELECT external_member_id FROM product_memberships WHERE id=$1", [first])).rows[0].external_member_id).toBeNull();
    await set(a.organizationId, [...await grants(roles.get(a.organizationId)!), "billing.read.all"]);
    await admin.query("UPDATE product_memberships SET policy_blocked=true WHERE id=$1", [first]);
    expect(await dispatchMemberBootstrap(worker, a.organizationId, { productId: product, adapter: tracking })).toBe("idle");
    expect(calls).toBe(0);
    await admin.query("UPDATE product_memberships SET policy_blocked=false WHERE id=$1", [first]);
    let started!: () => void, release!: () => void, inFlightCalls = 0;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const dispatching = dispatchMemberBootstrap(worker, a.organizationId, { productId: product, adapter: adapter(async input => {
      inFlightCalls++; expect(input.initialAccess).toBe("suspended"); started(); await held; return receipt("late-a");
    }) });
    await entered;
    const inFlight = (await admin.query<{ command_id: string }>("SELECT command_id FROM member_bootstrap_jobs WHERE organization_id=$1 AND status='running'", [a.organizationId])).rows[0];
    expect(inFlight).toBeDefined();
    await set(a.organizationId, (await grants(roles.get(a.organizationId)!)).filter(key => key !== "billing.read.all"));
    release(); expect(await dispatching).toBe("processed"); expect(inFlightCalls).toBe(1);
    expect((await admin.query("SELECT status,provider_reference FROM member_bootstrap_jobs WHERE command_id=$1", [inFlight!.command_id])).rows[0]).toEqual({ status: "superseded", provider_reference: "late-a" });
    expect((await admin.query("SELECT external_member_id FROM product_memberships WHERE id=$1", [first])).rows[0].external_member_id).toBeNull();
    expect(await dispatchMemberBootstrap(worker, a.organizationId, { productId: product, adapter: tracking })).toBe("idle"); expect(calls).toBe(0);
    const unaffected = await makeMapping(b.organizationId);
    expect(await dispatchMemberBootstrap(worker, b.organizationId, { productId: product, adapter: tracking })).toBe("processed"); expect(calls).toBe(1);
    expect((await admin.query("SELECT external_member_id,provisioning_status FROM product_memberships WHERE id=$1", [unaffected])).rows[0]).toEqual({ external_member_id: "provider-1", provisioning_status: "suspended" });
    // Each membership/instance has one mapping; create a second contributor for this instance.
    const secondUser = await syncAuthUser(url!, { authIssuer: "https://bootstrap-auth.test", authSubject: `second-${suffix}`, displayName: "Second", primaryEmail: null, status: "active", eventTimestamp: 1 });
    const secondMember = createCanonicalId("membership");
    await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')", [secondMember, b.organizationId, secondUser]);
    const secondMapping = await requestProductMembership(service, { actorUserId: owner, organizationId: b.organizationId, productInstanceId: instances.get(b.organizationId)!, membershipId: secondMember });
    const catalogLease = await claimMemberBootstrap(worker, b.organizationId, product); expect(catalogLease?.membershipId).toBe(secondMember);
    await admin.query("UPDATE products SET catalog_metadata=$2 WHERE id=$1", [product, { ...required, requiredPermissions: [...required.requiredPermissions, "usage.read.all"] }]);
    await finishMemberBootstrap(worker, b.organizationId, catalogLease!, receipt("late-b"));
    expect((await admin.query("SELECT status,provider_reference FROM member_bootstrap_jobs WHERE command_id=$1", [catalogLease!.commandId])).rows[0]).toEqual({ status: "superseded", provider_reference: "late-b" });
    expect((await admin.query("SELECT external_member_id FROM product_memberships WHERE id=$1", [secondMapping])).rows[0].external_member_id).toBeNull();
    expect((await admin.query("SELECT policy_blocked FROM product_memberships WHERE id=$1", [unaffected])).rows[0].policy_blocked).toBe(true);
    await admin.query("UPDATE products SET catalog_metadata=$2 WHERE id=$1", [product, required]);
    expect((await admin.query("SELECT policy_blocked FROM product_memberships WHERE id=$1", [unaffected])).rows[0].policy_blocked).toBe(true);
    expect(await dispatchMemberBootstrap(worker, b.organizationId, { productId: product, adapter: tracking })).toBe("idle"); expect(calls).toBe(1);
  } finally {
    for (const table of ["identity_audit_events", "member_denial_access_receipts", "member_denial_attempts", "member_denial_jobs", "member_access_commands", "member_bootstrap_attempts", "member_bootstrap_jobs", "product_membership_commands", "product_memberships", "product_instances", "memberships", "role_permissions", "roles"])
      await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`, [orgs]);
    await admin.query("DELETE FROM organizations WHERE id=ANY($1)", [orgs]); await admin.query("DELETE FROM products WHERE id=$1", [product]);
    await admin.query("DELETE FROM users WHERE auth_subject LIKE $1", [`%-${suffix}`]);
    for (const role of [workerRole, serviceRole, appRole]) await admin.query(`DROP ROLE ${role}`);
    await admin.end();
  }
}, 60000);
