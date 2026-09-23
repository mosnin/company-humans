import { expect, it } from "vitest";
import { createCanonicalId } from "./ids.js";
import { UsagePayloadV1Schema, MeterDefinitionV1Schema, UsageEventV1Schema } from "./usage-events.js";
import { signEventEnvelope, verifyEventEnvelope } from "./signing.js";
import type { EventEnvelopeV1 } from "./envelopes.js";
const payload = { productInstanceId:createCanonicalId("productInstance"),membershipId:null,teamId:null,meterKey:"enriched-leads",meterVersion:1,quantity:"1.250000",unit:"lead",sourceCost:null,customerRateVersion:null,metadata:{} };
it("uses exact decimal quantities and explicit unknown cost/rate state", () => {
  const parsed = UsagePayloadV1Schema.parse(payload);
  expect(parsed.quantity).toBe("1.25");
  expect(parsed.capabilityKey).toBeNull();
  for (const quantity of [1.25,"-1","Infinity","1e6","0.0000001","1000000000000"]) expect(UsagePayloadV1Schema.safeParse({...payload,quantity}).success).toBe(false);
});
it("accepts a valid capability key and rejects malformed keys", () => {
  expect(UsagePayloadV1Schema.safeParse({...payload,capabilityKey:"outbound-enrichment"}).success).toBe(true);
  for (const capabilityKey of ["", "Outbound Enrichment", "bad/key"]) {
    expect(UsagePayloadV1Schema.safeParse({...payload,capabilityKey}).success).toBe(false);
  }
});
it("binds capability attribution to the event signature", () => {
  const key = new Uint8Array(32).fill(7);
  const body = {
    schemaVersion:1, eventId:createCanonicalId("event"), organizationId:createCanonicalId("organization"),
    productId:createCanonicalId("product"), eventType:"usage.recorded", source:{system:"scalar",eventId:"capability-signature"},
    actor:{type:"service",id:"scalar-enrichment"}, environment:"test", occurredAt:"2026-01-01T00:00:00Z",
    reportedAt:"2026-01-01T00:00:01Z", idempotencyKey:"capability-signature", payload:{...payload,capabilityKey:"outbound-enrichment"},
  } satisfies EventEnvelopeV1;
  const signed = signEventEnvelope(body, "test-key", key);
  expect(verifyEventEnvelope(signed, keyId => keyId === "test-key" ? key : undefined)).toEqual(signed);
  expect(() => verifyEventEnvelope({...signed,payload:{...signed.payload,capabilityKey:"other-capability"}}, keyId => keyId === "test-key" ? key : undefined)).toThrow("Invalid event signature");
});
it("bounds usage metadata and rejects unversioned or incomplete meters", () => {
  expect(UsagePayloadV1Schema.safeParse({...payload,metadata:{raw:"x".repeat(16385)}}).success).toBe(false);
  expect(UsagePayloadV1Schema.safeParse({...payload,meterVersion:0}).success).toBe(false);
  const meter={schemaVersion:1,productId:createCanonicalId("product"),meterKey:"enriched-leads",version:1,unit:"lead",aggregation:"sum",displayName:"Enriched leads"};
  expect(MeterDefinitionV1Schema.parse(meter)).toEqual(meter);
  expect(MeterDefinitionV1Schema.safeParse({...meter,aggregation:"average"}).success).toBe(false);
});

it("requires an explicit matching membership for human attribution", () => {
  const membershipId = createCanonicalId("membership");
  const event = { schemaVersion:1, eventId:createCanonicalId("event"), organizationId:createCanonicalId("organization"), productId:createCanonicalId("product"), eventType:"usage.recorded", source:{system:"scalar",eventId:"one"}, actor:{type:"human",userId:createCanonicalId("user"),membershipId}, environment:"test", occurredAt:"2026-01-01T00:00:00Z", reportedAt:"2026-01-01T00:00:01Z", idempotencyKey:"one", payload:{...payload,membershipId} };
  expect(UsageEventV1Schema.safeParse(event).success).toBe(true);
  expect(UsageEventV1Schema.safeParse({...event,actor:{type:"human",userId:event.actor.userId}}).success).toBe(false);
  expect(UsageEventV1Schema.safeParse({...event,payload:{...payload,membershipId:null}}).success).toBe(false);
  expect(UsageEventV1Schema.safeParse({...event,payload:{...payload,membershipId:createCanonicalId("membership")}}).success).toBe(false);
});
