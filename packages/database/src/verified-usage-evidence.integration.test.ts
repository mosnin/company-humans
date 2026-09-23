import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { createCanonicalId, type EventEnvelopeV1, type EventId } from "@company-human/contracts";
import { signEventEnvelope } from "@company-human/contracts/signing";
import { runMigrations } from "./migrate.js";
import { ingestUsageEvent } from "./usage-ingestion.js";
import { readVerifiedUsageEvidence, StoredUsageVerificationError } from "./verified-usage-evidence.js";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.COMPANY_HUMAN_VERIFIED_USAGE_TEST === "1";

it.skipIf(!databaseUrl || !enabled)("rechecks persisted signatures, projections, scope and quarantine under a restricted read-only transaction", async () => {
  const target = new URL(databaseUrl!);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
      !target.pathname.slice(1).startsWith("company_human_0076_"))
    throw new Error("Verified usage fixture requires a disposable loopback company_human_0076_ database");
  await runMigrations(databaseUrl!);
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  const suffix = randomBytes(6).toString("hex");
  const runtimeRole = `ch_verified_usage_${suffix}`;
  const runtimePassword = randomBytes(20).toString("hex");
  const runtimeUrl = new URL(databaseUrl!);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = runtimePassword;
  const actor = createCanonicalId("user");
  const organizationId = createCanonicalId("organization");
  const otherOrganizationId = createCanonicalId("organization");
  const productId = createCanonicalId("product");
  const productInstanceId = createCanonicalId("productInstance");
  const roleId = createCanonicalId("role");
  const membershipId = createCanonicalId("membership");
  const key = new Uint8Array(32).fill(23);
  const authority = { keyId: "verified-key", key, organizationId, productId, productInstanceId,
    environment: "test" as const, sourceSystem: "scalar", status: "active" as const };
  const usage = (eventId: EventId, sourceEventId: string, meterKey = "leads"): EventEnvelopeV1 => ({
    schemaVersion: 1, eventId, organizationId, productId, eventType: "usage.recorded",
    source: { system: "scalar", eventId: sourceEventId, operationId: "enrich:operation-1" },
    actor: { type: "service", id: "scalar" }, environment: "test",
    occurredAt: "2026-09-23T10:00:00.123456Z", reportedAt: "2026-09-23T10:00:01.000001Z",
    idempotencyKey: sourceEventId,
    payload: { productInstanceId, membershipId: null, teamId: null, capabilityKey: "enrichment",
      meterKey, meterVersion: 1, quantity: "1.250000", unit: "lead", sourceCost: null,
      customerRateVersion: null, metadata: {} },
  });
  try {
    await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`GRANT company_human_usage_revalidator TO ${runtimeRole}`);
    await admin.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://verified.test',$1,'Verifier', 'active',1)", [actor]);
    for (const [id, slug] of [[organizationId, `verified-${suffix}`], [otherOrganizationId, `other-${suffix}`]] as const)
      await admin.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,$2,'Verifier test',$3)", [id, slug, actor]);
    await admin.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,'owner')", [roleId, organizationId]);
    await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) SELECT $1,$2,permission_key FROM role_permission_defaults WHERE role_key='owner'", [organizationId, roleId]);
    await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key,role_id) VALUES($1,$2,$3,'active','owner',$4)", [membershipId, organizationId, actor, roleId]);
    await admin.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'Verified usage product')", [productId, `verified-${suffix}`]);
    await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'main','connected',$4)", [productInstanceId, organizationId, productId, actor]);
    await admin.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'leads',1,'lead','sum','Leads')", [productId]);
    const accepted = usage(createCanonicalId("event"), `accepted-${suffix}`);
    const quarantined = usage(createCanonicalId("event"), `quarantined-${suffix}`, "unknown-leads");
    await admin.query("BEGIN");
    await admin.query("SET LOCAL ROLE company_human_usage_ingest");
    expect((await ingestUsageEvent(admin, signEventEnvelope(accepted, authority.keyId, key), authority)).disposition).toBe("accepted");
    expect((await ingestUsageEvent(admin, signEventEnvelope(quarantined, authority.keyId, key), authority)).disposition).toBe("quarantined");
    await admin.query("COMMIT");
    const verified = await readVerifiedUsageEvidence(runtimeUrl.toString(), { eventId: accepted.eventId, actorUserId: actor }, authority);
    expect(verified).toMatchObject({ eventId: accepted.eventId, actualQuantity: "1.25", signatureVerified: true,
      authorizesUsage: false, providerEnforcementConfirmed: false });
    await expect(readVerifiedUsageEvidence(runtimeUrl.toString(), { eventId: accepted.eventId, actorUserId: actor },
      { ...authority, organizationId: otherOrganizationId })).rejects.toThrow(StoredUsageVerificationError);
    await expect(readVerifiedUsageEvidence(runtimeUrl.toString(), { eventId: accepted.eventId, actorUserId: actor },
      { ...authority, keyId: "revoked" })).rejects.toThrow(StoredUsageVerificationError);
    await expect(readVerifiedUsageEvidence(runtimeUrl.toString(), { eventId: quarantined.eventId, actorUserId: actor }, authority))
      .rejects.toThrow(/quarantined/);
    await admin.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'unknown-leads',1,'lead','sum','Recovered leads')", [productId]);
    await admin.query("INSERT INTO usage_quarantine_releases(event_id,organization_id,actor_user_id,reason) VALUES($1,$2,$3,'fixture release')",
      [quarantined.eventId, organizationId, actor]);
    expect((await readVerifiedUsageEvidence(runtimeUrl.toString(), { eventId: quarantined.eventId, actorUserId: actor }, authority))
      .ingestionDisposition).toBe("released");
    const forged = usage(createCanonicalId("event"), `forged-${suffix}`);
    await admin.query(`INSERT INTO usage_events
      (event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,
       idempotency_key,membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,
       disposition,envelope,signature)
      VALUES($1,$2,$3,$4,'test','scalar',$5,$5,NULL,NULL,'leads',1,1.25,'lead',$6,$7,'accepted',$8,'{}'::jsonb)`,
    [forged.eventId, organizationId, productId, productInstanceId, forged.source.eventId,
      forged.occurredAt, forged.reportedAt, JSON.stringify(forged)]);
    await expect(readVerifiedUsageEvidence(runtimeUrl.toString(), { eventId: forged.eventId, actorUserId: actor }, authority))
      .rejects.toThrow(StoredUsageVerificationError);
    await expect(readVerifiedUsageEvidence(databaseUrl!, { eventId: accepted.eventId, actorUserId: actor }, authority))
      .rejects.toThrow(/Restricted read-only/);
  } finally {
    await admin.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
    await admin.end();
  }
});
