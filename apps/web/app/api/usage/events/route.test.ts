import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCanonicalId, type EventEnvelopeV1 } from "@company-human/contracts";
import { signEventEnvelope } from "@company-human/contracts/signing";
import { InvalidUsageTeamAttributionError, storeSignedUsage } from "@company-human/database/usage-ingestion";
import { POST } from "./route";
vi.mock("@company-human/database/usage-ingestion", async (importOriginal) => ({ ...await importOriginal<typeof import("@company-human/database/usage-ingestion")>(), storeSignedUsage: vi.fn() }));
const key = new Uint8Array(32).fill(11);
const org=createCanonicalId("organization"), product=createCanonicalId("product"), instance=createCanonicalId("productInstance");
const body: EventEnvelopeV1 = {schemaVersion:1,eventId:createCanonicalId("event"),organizationId:org,productId:product,eventType:"usage.recorded",source:{system:"scalar",eventId:"one"},actor:{type:"service",id:"enrichment"},environment:"test",occurredAt:"2026-01-01T00:00:00Z",reportedAt:"2026-01-01T00:00:01Z",idempotencyKey:"one",payload:{productInstanceId:instance,membershipId:null,teamId:null,meterKey:"enriched-leads",meterVersion:1,quantity:"1",unit:"lead",sourceCost:null,customerRateVersion:null,metadata:{}}};
const entry={keyId:"scalar-test",secretEnv:"USAGE_SIGNING_KEY_TEST",organizationId:org,productId:product,productInstanceId:instance,sourceSystem:"scalar",environment:"test",notBefore:"2020-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z",revoked:false};
const signed=()=>signEventEnvelope(body,entry.keyId,key);
const request=(value:unknown)=>new NextRequest("https://human.example/api/usage/events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)});
beforeEach(()=>{
  vi.stubEnv("USAGE_SIGNING_AUTHORITIES",JSON.stringify([entry]));
  vi.stubEnv("USAGE_SIGNING_KEY_TEST",Buffer.from(key).toString("hex"));
  vi.stubEnv("DATABASE_USAGE_INGEST_URL","postgresql://test-only");
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it("accepts an authenticated product event without browser session and returns only a receipt",async()=>{
  vi.mocked(storeSignedUsage).mockResolvedValue({eventId:body.eventId,disposition:"accepted",duplicate:false});
  const response=await POST(request(signed()));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({eventId:body.eventId,disposition:"accepted",duplicate:false});
  expect(storeSignedUsage).toHaveBeenCalledWith("postgresql://test-only",signed(),expect.objectContaining({organizationId:org,key:Buffer.from(key)}));
});
it("rejects tampering before database access",async()=>{
  expect((await POST(request({...signed(),payload:{...body.payload,quantity:"999"}}))).status).toBe(401);
  expect(storeSignedUsage).not.toHaveBeenCalled();
});
it("rejects other tenant, instance, source or environment even with a valid signature",async()=>{
  for(const patch of [{organizationId:createCanonicalId("organization")},{environment:"production" as const},{source:{system:"cadre",eventId:"one"}},{payload:{...body.payload,productInstanceId:createCanonicalId("productInstance")}}]) {
    expect((await POST(request(signEventEnvelope({...body,...patch},entry.keyId,key)))).status).toBe(401);
  }
  expect(storeSignedUsage).not.toHaveBeenCalled();
});
it("rejects revoked, expired and unknown keys without database access",async()=>{
  for(const config of [[{...entry,revoked:true}],[{...entry,expiresAt:"2021-01-01T00:00:00Z"}],[]]) {
    vi.stubEnv("USAGE_SIGNING_AUTHORITIES",JSON.stringify(config));
    expect((await POST(request(signed()))).status).toBe(401);
  }
  expect(storeSignedUsage).not.toHaveBeenCalled();
});
it("bounds actual body bytes without trusting Content-Length",async()=>{
  const input = new NextRequest("https://human.example/api/usage/events",{method:"POST",headers:{"content-type":"application/json","content-length":"1"},body:JSON.stringify({large:"x".repeat(65536)})});
  expect((await POST(input)).status).toBe(413);
  expect(storeSignedUsage).not.toHaveBeenCalled();
});
it("distinguishes quarantined, duplicate and conflicting receipts",async()=>{
  vi.mocked(storeSignedUsage).mockResolvedValueOnce({eventId:body.eventId,disposition:"quarantined",duplicate:false});
  expect((await POST(request(signed()))).status).toBe(202);
  vi.mocked(storeSignedUsage).mockResolvedValueOnce({eventId:body.eventId,disposition:"accepted",duplicate:true});
  expect((await POST(request(signed()))).status).toBe(200);
  vi.mocked(storeSignedUsage).mockRejectedValueOnce(new Error("Usage idempotency conflict"));
  expect((await POST(request(signed()))).status).toBe(409);
});
it("redacts database failures and fails closed without database configuration",async()=>{
  vi.mocked(storeSignedUsage).mockRejectedValueOnce(new Error("secret connection info"));
  const response=await POST(request(signed()));
  expect(response.status).toBe(503);expect(await response.text()).not.toContain("secret");
  vi.stubEnv("DATABASE_USAGE_INGEST_URL","");
  expect((await POST(request(signed()))).status).toBe(503);
});
it("returns a nonretryable, redacted response for disproven historical team attribution",async()=>{
  vi.mocked(storeSignedUsage).mockRejectedValueOnce(new InvalidUsageTeamAttributionError());
  const response=await POST(request(signed()));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({error:"Usage team attribution invalid"});
  vi.mocked(storeSignedUsage).mockRejectedValueOnce(Object.assign(new Error("sensitive SQL context"),{code:"CHT01"}));
  const unexpected=await POST(request(signed()));
  expect(unexpected.status).toBe(503);
  expect(await unexpected.text()).not.toContain("sensitive");
});
