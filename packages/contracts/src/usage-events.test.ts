import { expect, it } from "vitest";
import { createCanonicalId } from "./ids.js";
import { UsagePayloadV1Schema, MeterDefinitionV1Schema, UsageEventV1Schema } from "./usage-events.js";
const payload = { productInstanceId:createCanonicalId("productInstance"),membershipId:null,teamId:null,meterKey:"enriched-leads",meterVersion:1,quantity:"1.250000",unit:"lead",sourceCost:null,customerRateVersion:null,metadata:{} };
it("uses exact decimal quantities and explicit unknown cost/rate state", () => {
  expect(UsagePayloadV1Schema.parse(payload).quantity).toBe("1.25");
  for (const quantity of [1.25,"-1","Infinity","1e6","0.0000001","1000000000000"]) expect(UsagePayloadV1Schema.safeParse({...payload,quantity}).success).toBe(false);
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
