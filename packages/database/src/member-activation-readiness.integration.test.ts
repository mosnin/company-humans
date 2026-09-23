import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { createCanonicalId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { prepareMemberCapabilitySnapshot } from "./member-capability-snapshots.js";
import { claimMemberDenial, finishMemberDenial } from "./member-denial-worker.js";
import { inspectMemberActivationReadiness } from "./member-activation-readiness.js";

const databaseUrl = process.env.DATABASE_URL;
it.skipIf(!databaseUrl)("diagnoses tenant-scoped activation evidence without granting access", async () => {
  const suffix = randomBytes(6).toString("hex");
  const role = `ch_activation_${suffix}`, workerRole = `ch_activationw_${suffix}`;
  const password = randomBytes(20).toString("hex");
  const admin = new Client({ connectionString: databaseUrl }); await admin.connect();
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
  await admin.query(`GRANT company_human_service TO ${role}`);
  await admin.query(`CREATE ROLE ${workerRole} LOGIN PASSWORD '${password}'`);
  await admin.query(`GRANT company_human_member_worker TO ${workerRole}`);
  const endpoint = new URL(databaseUrl!); endpoint.username = role; endpoint.password = password;
  const workerEndpoint = new URL(databaseUrl!); workerEndpoint.username = workerRole; workerEndpoint.password = password;
  const actor = await syncAuthUser(databaseUrl!, { authIssuer: "https://activation.test", authSubject: `owner-${suffix}`,
    displayName: "Owner", primaryEmail: null, status: "active", eventTimestamp: 1 });
  const stranger = await syncAuthUser(databaseUrl!, { authIssuer: "https://activation.test", authSubject: `stranger-${suffix}`,
    displayName: "Stranger", primaryEmail: null, status: "active", eventTimestamp: 1 });
  const target = await syncAuthUser(databaseUrl!, { authIssuer: "https://activation.test", authSubject: `target-${suffix}`,
    displayName: "Target", primaryEmail: null, status: "active", eventTimestamp: 1 });
  const org = await createOrganization(databaseUrl!, { ownerUserId: actor, slug: `activation-${suffix}`, name: "A" });
  const other = await createOrganization(databaseUrl!, { ownerUserId: stranger, slug: `activation-other-${suffix}`, name: "B" });
  const product = createCanonicalId("product"), instance = createCanonicalId("productInstance");
  const member = createCanonicalId("membership"), mapping = createCanonicalId("productMembership");
  const command = createCanonicalId("provisioningOperation"), limit = createCanonicalId("usageLimit");
  const orphanLimit = createCanonicalId("usageLimit");
  const metadata = { schemaVersion: 1, description: "Fixture", category: "sales", supportedCapabilities: ["read"],
    provisioningModes: ["connected"], supportedMemberOperations: ["provision", "suspend"], usageMeters: ["lead"],
    requiredPermissions: ["product.use"], adapterVersion: "1.0.0", billingBehavior: "organization_sponsored",
    deepLinks: {}, connectionRequirements: [] };
  const input = { actorUserId: actor, organizationId: org.organizationId, productMembershipId: mapping };
  try {
    await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",
      [product, `activation-${suffix}`, metadata]);
    await admin.query(`INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,
      provisioning_status,external_organization_id,created_by_user_id)
      VALUES($1,$2,$3,'main','connected','active','fixture-org',$4)`, [instance, org.organizationId, product, actor]);
    await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')",
      [member, org.organizationId, target]);
    await admin.query(`INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,
      provisioning_status,external_member_id,created_by_user_id)
      VALUES($1,$2,$3,$4,'suspended','fixture-member',$5)`, [mapping, org.organizationId, instance, member, actor]);
    const before = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(before.ready).toBe(false);
    expect(before.reasons).toContain("binding_unverified");
    expect(before.reasons).toContain("capability_snapshot_missing");
    expect(before.reasons).toContain("limit_policy_missing");
    expect(before.reasons).toContain("meter_semantics_unverified");
    await expect(inspectMemberActivationReadiness(endpoint.toString(), { ...input, actorUserId: stranger })).rejects.toThrow("denied");
    const cross = await inspectMemberActivationReadiness(endpoint.toString(), {
      actorUserId: stranger, organizationId: other.organizationId, productMembershipId: mapping });
    expect(cross.reasons).toContain("membership_unavailable");

    await admin.query(`INSERT INTO product_membership_commands(id,organization_id,product_membership_id,
      desired_revision,operation,idempotency_key,actor_user_id)
      VALUES($1,$2,$3,1,'provisionMember',$4,$5)`, [command, org.organizationId, mapping, `${mapping}:member:1`, actor]);
    await admin.query(`INSERT INTO member_bootstrap_jobs(command_id,organization_id,status,attempt_count,provider_reference)
      VALUES($1,$2,'succeeded',1,'fixture-member')`, [command, org.organizationId]);
    await admin.query(`INSERT INTO member_bootstrap_attempts(organization_id,command_id,attempt_number,lease_token,
      finished_at,outcome,provider_reference) VALUES($1,$2,1,$3,now(),'succeeded','fixture-member')`,
      [org.organizationId, command, randomUUID()]);
    await admin.query(`UPDATE product_memberships SET provider_receipt_reference=$2,
      provisioned_at=(SELECT finished_at FROM member_bootstrap_attempts WHERE command_id=$3 AND attempt_number=1)
      WHERE id=$1`, [mapping, `${command}:attempt:1`, command]);
    await admin.query(`INSERT INTO product_usage_limits(id,organization_id,product_instance_id,membership_id,meter_key,
      unit,window_key,created_by_user_id) VALUES($1,$2,$3,NULL,'lead','lead','utc_month',$4)`,
      [limit, org.organizationId, instance, actor]);
    await admin.query(`INSERT INTO product_usage_limit_revisions(organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id)
      VALUES($1,$2,1,10,$3)`, [org.organizationId, limit, actor]);
    const pendingDenial = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(pendingDenial.reasons).toContain("denial_outstanding");
    const denialCommand = (await admin.query<{ id: string }>(`SELECT c.id FROM product_membership_commands c
      JOIN product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
      WHERE c.product_membership_id=$1 AND c.operation='suspendMember' AND c.desired_revision=pm.desired_revision`,
      [mapping])).rows[0]!.id;
    // A successful-looking job without its exact fenced readback is still
    // unresolved. These privileged fixture rows are removed before the real
    // restricted denial worker runs below.
    await admin.query("UPDATE member_denial_jobs SET status='succeeded',attempt_count=1 WHERE command_id=$1", [denialCommand]);
    await admin.query(`INSERT INTO member_denial_attempts(organization_id,command_id,attempt_number,lease_token,
      finished_at,outcome,provider_reference) VALUES($1,$2,1,$3,now(),'succeeded','fixture-member')`,
      [org.organizationId, denialCommand, randomUUID()]);
    const withoutDenialReceipt = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(withoutDenialReceipt.reasons).toContain("denial_outstanding");
    await admin.query(`INSERT INTO member_denial_access_receipts(organization_id,command_id,attempt_number,receipt)
      VALUES($1,$2,1,$3)`, [org.organizationId, denialCommand, { access: "suspended", accessRevision: -1 }]);
    const wrongDenialReceipt = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(wrongDenialReceipt.reasons).toContain("denial_outstanding");
    await admin.query("DELETE FROM member_denial_access_receipts WHERE command_id=$1", [denialCommand]);
    await admin.query("DELETE FROM member_denial_attempts WHERE command_id=$1", [denialCommand]);
    await admin.query("UPDATE member_denial_jobs SET status='pending',attempt_count=0 WHERE command_id=$1", [denialCommand]);
    const denial = await claimMemberDenial(workerEndpoint.toString(), org.organizationId, product, true);
    expect(denial?.accessCommand).toBeDefined();
    await finishMemberDenial(workerEndpoint.toString(), org.organizationId, denial!,
      { status: "succeeded", value: { externalMemberId: "fixture-member", status: "suspended" } }, denial!.accessCommand);
    await admin.query("UPDATE product_memberships SET policy_blocked=false WHERE id=$1", [mapping]);
    const beforeLimitReceipt = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(beforeLimitReceipt.reasons).toContain("limit_readback_missing");
    const limitState = { schemaVersion: 1, limit: { schemaVersion: 1, usageLimitId: limit, organizationId: org.organizationId,
      productInstanceId: instance, membershipId: null, meterKey: "lead", unit: "lead", window: "utc_month",
      revision: 1, maximumQuantity: "10" }, target: { externalOrganizationId: "fixture-org", externalMemberId: null },
      enforcement: "hard_stop", accounting: "preserve_accumulated_usage", scope: "organization_aggregate" };
    await admin.query("UPDATE usage_limit_jobs SET status='succeeded',attempt_count=1 WHERE usage_limit_id=$1 AND revision=1", [limit]);
    await admin.query(`INSERT INTO usage_limit_attempts(organization_id,usage_limit_id,revision,attempt_number,lease_token,
      finished_at,outcome,apply_receipt,readback_receipt) VALUES($1,$2,1,1,$3,now(),'succeeded',$4,$4)`,
      [org.organizationId, limit, randomUUID(), { status: "succeeded", value: limitState }]);
    const staged = await prepareMemberCapabilitySnapshot(endpoint.toString(), input);
    await admin.query(`UPDATE capability_jobs SET status='succeeded',attempt_count=1 WHERE product_membership_id=$1 AND revision=$2`,
      [mapping, staged.policyRevision]);
    await admin.query(`INSERT INTO capability_attempts(organization_id,product_membership_id,revision,attempt_number,
      lease_token,finished_at,outcome,apply_receipt,readback_receipt)
      VALUES($1,$2,$3,1,$4,now(),'succeeded',$5,$5)`, [org.organizationId, mapping, staged.policyRevision,
      randomUUID(), { status: "succeeded", value: staged }]);
    const commandCount = (await admin.query("SELECT count(*)::int n FROM member_access_commands WHERE product_membership_id=$1", [mapping])).rows[0].n;
    const journalComplete = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(journalComplete.reasons).toEqual(["meter_semantics_unverified"]);
    expect(journalComplete.evidence).toEqual({ capabilityRevision: staged.policyRevision, checkedLimitCount: 1, declaredMeterCount: 1 });
    expect((await admin.query("SELECT count(*)::int n FROM member_access_commands WHERE product_membership_id=$1", [mapping])).rows[0].n).toBe(commandCount);
    await admin.query(`INSERT INTO product_usage_limits(id,organization_id,product_instance_id,membership_id,meter_key,
      unit,window_key,created_by_user_id) VALUES($1,$2,$3,$4,'lead','lead','utc_week',$5)`,
      [orphanLimit, org.organizationId, instance, member, actor]);
    const orphan = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(orphan.reasons).toContain("limit_policy_missing");
    expect(orphan.evidence.checkedLimitCount).toBe(2);
    await admin.query("DELETE FROM product_usage_limits WHERE id=$1", [orphanLimit]);
    await admin.query("UPDATE product_memberships SET provider_receipt_reference='forged' WHERE id=$1", [mapping]);
    const tamperedBinding = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(tamperedBinding.reasons).toContain("binding_unverified");
    await admin.query("UPDATE product_memberships SET provider_receipt_reference=$2 WHERE id=$1", [mapping, `${command}:attempt:1`]);
    const ownerRole = (await admin.query<{ role_id: string }>("SELECT role_id FROM memberships WHERE id=$1", [org.ownerMembershipId])).rows[0]!.role_id;
    for (const deniedPermission of ["applications.manage", "budgets.manage"]) {
      await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key=$3",
        [org.organizationId, ownerRole, deniedPermission]);
      await expect(inspectMemberActivationReadiness(endpoint.toString(), input)).rejects.toThrow("Activation diagnostic denied");
      await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,$3)",
        [org.organizationId, ownerRole, deniedPermission]);
    }
    await admin.query(`INSERT INTO product_usage_limit_revisions(organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id)
      VALUES($1,$2,2,8,$3)`, [org.organizationId, limit, actor]);
    const revisedLimit = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(revisedLimit.reasons).toContain("limit_readback_missing");
    expect(revisedLimit.reasons).toContain("denial_outstanding"); // the newer access fence has no readback yet
    // A stale policy snapshot never inherits the earlier success receipt.
    await admin.query("UPDATE products SET catalog_metadata=$2 WHERE id=$1", [product, { ...metadata, supportedCapabilities: ["read", "write"] }]);
    const stale = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(stale.reasons).toContain("capability_snapshot_stale");
    await admin.query("UPDATE products SET catalog_metadata=$2 WHERE id=$1", [product, metadata]);
    await admin.query("UPDATE memberships SET status='suspended' WHERE id=$1", [member]);
    const inactive = await inspectMemberActivationReadiness(endpoint.toString(), input);
    expect(inactive.reasons).toContain("identity_inactive");
    const state = (await admin.query("SELECT provisioning_status,access_revision FROM product_memberships WHERE id=$1", [mapping])).rows[0];
    expect(state.provisioning_status).toBe("suspended");
    expect((await admin.query(`SELECT count(*)::int n FROM member_access_commands a JOIN product_membership_commands c
      ON c.id=a.command_id WHERE a.product_membership_id=$1 AND c.operation NOT IN ('suspendMember','removeMember')`, [mapping])).rows[0].n).toBe(0);
  } finally {
    for (const table of ["member_denial_access_receipts", "member_denial_attempts", "member_denial_jobs", "member_access_commands",
      "capability_attempts", "capability_jobs", "member_capability_snapshots", "member_bootstrap_attempts", "member_bootstrap_jobs",
      "product_membership_commands", "usage_limit_attempts", "usage_limit_jobs", "product_usage_limit_revisions", "product_usage_limits",
      "product_memberships", "identity_audit_events", "product_instances", "memberships", "roles"])
      await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`, [[org.organizationId, other.organizationId]]);
    await admin.query("DELETE FROM organizations WHERE id=ANY($1)", [[org.organizationId, other.organizationId]]);
    await admin.query("DELETE FROM users WHERE id=ANY($1)", [[actor, stranger, target]]);
    await admin.query("DELETE FROM products WHERE id=$1", [product]);
    await admin.query(`DROP ROLE ${workerRole}`); await admin.query(`DROP ROLE ${role}`); await admin.end();
  }
}, 60_000);
