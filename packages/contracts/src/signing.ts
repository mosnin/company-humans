import { createHmac, timingSafeEqual } from "node:crypto";
import { AuditEnvelopeV1Schema, EnvelopeSignatureV1Schema, EventEnvelopeV1Schema, SignedAuditEnvelopeV1Schema, SignedEventEnvelopeV1Schema, type AuditEnvelopeV1, type EventEnvelopeV1, type SignedAuditEnvelopeV1, type SignedEventEnvelopeV1 } from "./envelopes.js";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Envelope is not JSON serializable");
  return encoded;
}

function signature(domain: "event" | "audit", body: object, key: Uint8Array): string {
  if (key.byteLength < 32) throw new Error("Envelope signing key must be at least 32 bytes");
  return createHmac("sha256", key)
    .update(`company-human:${domain}:v1\n`)
    .update(canonicalJson(body))
    .digest("hex");
}

function equalDigest(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Canonical bytes used by the V1 event HMAC. Keep database verification on
 * these exact UTF-8 bytes; PostgreSQL jsonb text is not the same encoding.
 */
export function canonicalEventEnvelopeV1(body: EventEnvelopeV1): string {
  return canonicalJson(EventEnvelopeV1Schema.parse(body));
}

/** Authenticate the exact parsed JSON body before any schema can strip or
 * normalize fields. A valid digest over a body that fails its schema remains
 * invalid, including unknown nested source and actor fields.
 */
function verifyRawEnvelope(domain: "event" | "audit", input: unknown, keyFor: (keyId: string) => Uint8Array | undefined): void {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid signed envelope");
  const { signature: rawProof, ...body } = input as Record<string, unknown>;
  const proof = EnvelopeSignatureV1Schema.parse(rawProof);
  const key = keyFor(proof.keyId);
  if (!key || !equalDigest(proof.digest, signature(domain, body, key)))
    throw new Error(`Invalid ${domain} signature`);
}

export function signEventEnvelope(body: EventEnvelopeV1, keyId: string, key: Uint8Array): SignedEventEnvelopeV1 {
  const validated = EventEnvelopeV1Schema.parse(body);
  return SignedEventEnvelopeV1Schema.parse({
    ...validated,
    signature: { algorithm: "hmac-sha256", keyId, digest: signature("event", validated, key) },
  });
}

export function verifyEventEnvelope(input: unknown, keyFor: (keyId: string) => Uint8Array | undefined): SignedEventEnvelopeV1 {
  verifyRawEnvelope("event", input, keyFor);
  const validated = SignedEventEnvelopeV1Schema.parse(input);
  return validated;
}

export function signAuditEnvelope(body: AuditEnvelopeV1, keyId: string, key: Uint8Array): SignedAuditEnvelopeV1 {
  const validated = AuditEnvelopeV1Schema.parse(body);
  return SignedAuditEnvelopeV1Schema.parse({
    ...validated,
    signature: { algorithm: "hmac-sha256", keyId, digest: signature("audit", validated, key) },
  });
}

export function verifyAuditEnvelope(input: unknown, keyFor: (keyId: string) => Uint8Array | undefined): SignedAuditEnvelopeV1 {
  verifyRawEnvelope("audit", input, keyFor);
  const validated = SignedAuditEnvelopeV1Schema.parse(input);
  return validated;
}
