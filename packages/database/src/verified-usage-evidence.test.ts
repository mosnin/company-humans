import { describe, expect, it } from "vitest";
import { createCanonicalId, type EventEnvelopeV1 } from "@company-human/contracts";
import { signEventEnvelope } from "@company-human/contracts/signing";
import { StoredUsageVerificationError, verifyStoredUsageRow } from "./verified-usage-evidence.js";

const key = new Uint8Array(32).fill(17);
const authority = {
  keyId: "usage-v1", key, organizationId: createCanonicalId("organization"),
  productId: createCanonicalId("product"), productInstanceId: createCanonicalId("productInstance"),
  environment: "test" as const, sourceSystem: "scalar", status: "active" as const,
};
const body: EventEnvelopeV1 = {
  schemaVersion: 1, eventId: createCanonicalId("event"), organizationId: authority.organizationId,
  productId: authority.productId, eventType: "usage.recorded",
  source: { system: "scalar", eventId: "provider-event-1", operationId: "enrich:lead-1" },
  actor: { type: "service", id: "scalar" }, environment: "test",
  occurredAt: "2026-09-23T08:00:01.123456-04:00",
  reportedAt: "2026-09-23T12:00:03.000001Z", idempotencyKey: "usage-1",
  payload: { productInstanceId: authority.productInstanceId, membershipId: null, teamId: null,
    capabilityKey: "enrichment", meterKey: "leads", meterVersion: 1, quantity: "1.000000",
    unit: "lead", sourceCost: null, customerRateVersion: null, metadata: {} },
};
function rowFor(source = body) {
  const { signature, ...envelope } = signEventEnvelope(source, authority.keyId, key);
  return {
    event_id: source.eventId, organization_id: source.organizationId, product_id: source.productId!,
    product_instance_id: source.payload.productInstanceId as string, environment: source.environment,
    source_system: source.source.system, source_event_id: source.source.eventId,
    source_operation_id: source.source.operationId!, idempotency_key: source.idempotencyKey,
    membership_id: source.payload.membershipId as null, team_id: source.payload.teamId as null,
    capability_key: source.payload.capabilityKey as string, meter_key: source.payload.meterKey as string,
    meter_version: source.payload.meterVersion as number, quantity: "1.000000", unit: source.payload.unit as string,
    occurred_at: "2026-09-23T12:00:01.123456Z", reported_at: "2026-09-23T12:00:03.000001Z",
    disposition: "accepted", released: false, exact_sum_meter_registered: true, envelope, signature,
  };
}

describe("stored signed usage evidence", () => {
  it("verifies signed source against every settlement projection and remains non-authorizing", () => {
    const result = verifyStoredUsageRow(rowFor(), authority);
    expect(result).toMatchObject({ eventId: body.eventId, actualQuantity: "1",
      source: { system: "scalar", operationId: "enrich:lead-1" },
      signatureVerified: true, authorizesUsage: false, providerEnforcementConfirmed: false,
      eligibleForSettlement: false, quarantineReleaseAuthorizationVerified: false });
    const original = rowFor();
    for (const [name, value] of [
      ["event_id", createCanonicalId("event")], ["organization_id", createCanonicalId("organization")],
      ["product_id", createCanonicalId("product")], ["product_instance_id", createCanonicalId("productInstance")],
      ["environment", "production"], ["source_system", "marketer"], ["source_event_id", "other"],
      ["source_operation_id", "other"], ["idempotency_key", "other"],
      ["membership_id", createCanonicalId("membership")], ["team_id", createCanonicalId("team")],
      ["capability_key", "other"], ["meter_key", "other"], ["meter_version", 2],
      ["quantity", "2.000000"], ["unit", "other"],
      ["occurred_at", "2026-09-23T12:00:02.123456Z"],
      ["reported_at", "2026-09-23T12:00:04.000001Z"],
    ] as const) {
      expect(() => verifyStoredUsageRow({ ...original, [name]: value }, authority), name)
        .toThrow(StoredUsageVerificationError);
    }
  });

  it("rejects forged accepted rows, mismatched or absent authority, and missing operation identity", () => {
    expect(() => verifyStoredUsageRow({ ...rowFor(), signature: {} }, authority)).toThrow(StoredUsageVerificationError);
    expect(() => verifyStoredUsageRow({ ...rowFor(), envelope: { ...rowFor().envelope, idempotencyKey: "tampered" } }, authority))
      .toThrow(StoredUsageVerificationError);
    expect(() => verifyStoredUsageRow(rowFor(), { ...authority, key: new Uint8Array(32).fill(2) }))
      .toThrow(StoredUsageVerificationError);
    expect(() => verifyStoredUsageRow(rowFor(), { ...authority, keyId: "revoked" }))
      .toThrow(StoredUsageVerificationError);
    expect(() => verifyStoredUsageRow(rowFor(), { ...authority, status: "revoked" }))
      .toThrow(StoredUsageVerificationError);
    expect(() => verifyStoredUsageRow(rowFor(), { ...authority, organizationId: createCanonicalId("organization") }))
      .toThrow(StoredUsageVerificationError);
    expect(() => verifyStoredUsageRow({ ...rowFor(), source_operation_id: null }, authority))
      .toThrow(StoredUsageVerificationError);
    expect(() => verifyStoredUsageRow({ ...rowFor(), exact_sum_meter_registered: false }, authority))
      .toThrow(StoredUsageVerificationError);
  });

  it("requires a quarantine release and handles a released source without rewriting it", () => {
    const quarantined = { ...rowFor(), disposition: "quarantined" };
    expect(() => verifyStoredUsageRow(quarantined, authority)).toThrow(/quarantined/);
    expect(verifyStoredUsageRow({ ...quarantined, released: true }, authority).ingestionDisposition).toBe("released");
    expect(() => verifyStoredUsageRow({ ...rowFor(), released: true }, authority)).toThrow(/conflicting/);
  });
});
