import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { createCanonicalId } from "./ids.js";
import { AuditEnvelopeV1Schema, EventEnvelopeV1Schema } from "./envelopes.js";
import { canonicalEventEnvelopeV1, signAuditEnvelope, signEventEnvelope, verifyAuditEnvelope, verifyEventEnvelope } from "./signing.js";

const key = new Uint8Array(32).fill(7);
const wrongKey = new Uint8Array(32).fill(8);
const actor = { type: "human" as const, userId: createCanonicalId("user"), membershipId: createCanonicalId("membership") };
const organizationId = createCanonicalId("organization");
const timestamp = "2026-09-20T05:00:00.000Z";

function event() {
  return EventEnvelopeV1Schema.parse({
    schemaVersion: 1,
    eventId: createCanonicalId("event"),
    organizationId,
    eventType: "usage.reported",
    source: { system: "scalar", eventId: "provider-123" },
    actor,
    environment: "test",
    occurredAt: timestamp,
    reportedAt: timestamp,
    idempotencyKey: "scalar-provider-123",
    payload: { meter: "lead_enriched", quantity: 1 },
  });
}

function audit() {
  return AuditEnvelopeV1Schema.parse({
    schemaVersion: 1,
    auditId: createCanonicalId("audit"),
    organizationId,
    actor,
    action: "member.suspended",
    target: { type: "membership", id: actor.membershipId },
    requestId: "request-123",
    occurredAt: timestamp,
  });
}

describe("signed version 1 envelopes", () => {
  it("exposes the exact UTF-8 event bytes used by signing for database verification", () => {
    const body = { ...event(), payload: { quantity: "1.250000", metadata: { note: "é / \"quoted\"" } } };
    const canonical = canonicalEventEnvelopeV1(body);
    expect(canonical).toBe(canonicalEventEnvelopeV1({ ...body, payload: { metadata: body.payload.metadata, quantity: "1.250000" } }));
    expect(createHmac("sha256", key).update("company-human:event:v1\n").update(canonical).digest("hex"))
      .toBe(signEventEnvelope(body, "test-key", key).signature.digest);
  });

  it("validates and verifies canonical event content regardless of property order", () => {
    const signed = signEventEnvelope(event(), "test-key", key);
    expect(verifyEventEnvelope(signed, () => key)).toEqual(signed);
    expect(verifyEventEnvelope({ ...signed, payload: { quantity: 1, meter: "lead_enriched" } }, () => key)).toEqual({ ...signed, payload: { quantity: 1, meter: "lead_enriched" } });
    expect(() => verifyEventEnvelope({ ...signed, payload: { quantity: 2 } }, () => key)).toThrow("Invalid event signature");
    expect(() => verifyEventEnvelope(signed, () => wrongKey)).toThrow("Invalid event signature");
    expect(() => verifyEventEnvelope(signed, () => undefined)).toThrow("Invalid event signature");
    expect(() => verifyEventEnvelope({ ...signed, source: { ...signed.source, hidden: "unsigned" } }, () => key))
      .toThrow("Invalid event signature");
    expect(() => verifyEventEnvelope({ ...signed, actor: { ...signed.actor, hidden: "unsigned" } }, () => key))
      .toThrow("Invalid event signature");
    expect(EventEnvelopeV1Schema.safeParse({ ...event(), source: { ...event().source, hidden: "unexpected" } }).success).toBe(false);
    expect(EventEnvelopeV1Schema.safeParse({ ...event(), actor: { ...actor, hidden: "unexpected" } }).success).toBe(false);
  });

  it("keeps legacy event signatures and binds an optional source operation to the signature", () => {
    const legacy = signEventEnvelope(event(), "test-key", key);
    expect(legacy.source).toEqual({ system: "scalar", eventId: "provider-123" });
    expect(verifyEventEnvelope(legacy, () => key)).toEqual(legacy);

    const withOperation = signEventEnvelope({ ...event(), source: { system: "scalar", eventId: "provider-123", operationId: "enrich:123/step-1" } }, "test-key", key);
    expect(withOperation.source.operationId).toBe("enrich:123/step-1");
    expect(verifyEventEnvelope(withOperation, () => key)).toEqual(withOperation);
    expect(() => verifyEventEnvelope({ ...withOperation, source: { ...withOperation.source, operationId: "enrich:123/step-2" } }, () => key)).toThrow("Invalid event signature");
    expect(() => verifyEventEnvelope({ ...withOperation, source: { system: "scalar", eventId: "provider-123" } }, () => key)).toThrow("Invalid event signature");
    expect(EventEnvelopeV1Schema.safeParse({ ...event(), source: { system: "scalar", eventId: "provider-123", operationId: "" } }).success).toBe(false);
    expect(EventEnvelopeV1Schema.safeParse({ ...event(), source: { system: "scalar", eventId: "provider-123", operationId: "x".repeat(257) } }).success).toBe(false);
    expect(EventEnvelopeV1Schema.safeParse({ ...event(), source: { system: "scalar", eventId: "provider-123", operationId: "line\nbreak" } }).success).toBe(false);
  });

  it("validates and verifies audit provenance without accepting an event signature", () => {
    const signed = signAuditEnvelope(audit(), "test-key", key);
    expect(verifyAuditEnvelope(signed, () => key)).toEqual(signed);
    expect(() => verifyAuditEnvelope({ ...signed, action: "member.removed" }, () => key)).toThrow("Invalid audit signature");
    expect(() => verifyAuditEnvelope({ ...signed, actor: { ...signed.actor, hidden: "unsigned" } }, () => key))
      .toThrow("Invalid audit signature");
    expect(() => verifyAuditEnvelope({ ...signed, target: { ...signed.target, hidden: "unsigned" } }, () => key))
      .toThrow("Invalid audit signature");
    expect(() => signEventEnvelope(event(), "test-key", new Uint8Array(8))).toThrow("at least 32 bytes");
  });

  it("rejects cross-tenant and wrong-version fields at validation", () => {
    expect(EventEnvelopeV1Schema.safeParse({ ...event(), organizationId: createCanonicalId("user") }).success).toBe(false);
    expect(AuditEnvelopeV1Schema.safeParse({ ...audit(), schemaVersion: 2 }).success).toBe(false);
  });
});
