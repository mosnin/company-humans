import { expect, it } from "vitest";
import { Client } from "pg";
import { createCanonicalId, type EventEnvelopeV1 } from "@company-human/contracts";
import { signEventEnvelope } from "@company-human/contracts/signing";
import { ingestUsageEvent } from "./usage-ingestion.js";
const url = process.env.DATABASE_URL;
it.skipIf(!url)("persists signed usage once, quarantines unknown meters and enforces immutable tenant scope", async () => {
  const client = new Client({ connectionString: url }); await client.connect();
  await client.query("BEGIN");
  try {
    const user = createCanonicalId("user"), org = createCanonicalId("organization"), otherOrg = createCanonicalId("organization"), product = createCanonicalId("product"), instance = createCanonicalId("productInstance");
    await client.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://test.invalid',$1,'Test','active',1)", [user]);
    for (const id of [org,otherOrg]) await client.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,$3,'Usage test',$2)", [id,user,id.replaceAll('_','-')]);
    await client.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'Usage product')", [product,`usage-${crypto.randomUUID()}`]);
    await client.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'main','connected',$4)", [instance,org,product,user]);
    await client.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'enriched-leads',1,'lead','sum','Enriched leads')", [product]);
    const differentUser=createCanonicalId("user");
    await client.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://test.invalid',$1,'Other','active',1)",[differentUser]);
    const member = createCanonicalId("membership"), foreignMember = createCanonicalId("membership"), foreignTeam = createCanonicalId("team");
    for (const [organizationId,membershipId] of [[org,member],[otherOrg,foreignMember]]) {
      const roleId=createCanonicalId("role");
      await client.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,'contributor')",[roleId,organizationId]);
      await client.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key,role_id) VALUES($1,$2,$3,'suspended','contributor',$4)",[membershipId,organizationId,user,roleId]);
    }
    await client.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'Foreign team')",[foreignTeam,otherOrg]);
    const key = new Uint8Array(32).fill(7);
    const authority = { keyId:"test-key", key, organizationId:org, productId:product, productInstanceId:instance, environment:"test" as const, sourceSystem:"scalar" };
    const body: EventEnvelopeV1 = { schemaVersion:1,eventId:createCanonicalId("event"),organizationId:org,productId:product,eventType:"usage.recorded",source:{system:"scalar",eventId:"source-1"},actor:{type:"service",id:"scalar-enrichment"},environment:"test",occurredAt:"2026-01-01T00:00:00Z",reportedAt:"2026-01-02T00:00:00Z",idempotencyKey:"operation-1",payload:{productInstanceId:instance,membershipId:null,teamId:null,meterKey:"enriched-leads",capabilityKey:"outbound-enrichment",meterVersion:1,quantity:"1.000000",unit:"lead",sourceCost:{amount:"1.25",currency:"USD",providerReference:"provider-1"},customerRateVersion:"rate-v1",metadata:{}} };
    const signed = signEventEnvelope(body,authority.keyId,key);
    await expect(ingestUsageEvent(client,signed,authority)).rejects.toThrow("restricted role");
    await client.query("SET LOCAL ROLE company_human_usage_ingest");
    expect(await ingestUsageEvent(client,signed,authority)).toEqual({eventId:body.eventId,disposition:"accepted",duplicate:false});
    expect(await ingestUsageEvent(client,signed,authority)).toEqual({eventId:body.eventId,disposition:"accepted",duplicate:true});
    await expect(ingestUsageEvent(client,{...signed,payload:{...body.payload,quantity:"2"}},authority)).rejects.toThrow("signature");
    await expect(ingestUsageEvent(client,signEventEnvelope({...body,payload:{...body.payload,quantity:"2"}},authority.keyId,key),authority)).rejects.toThrow("idempotency conflict");
    await expect(ingestUsageEvent(client,signed,{...authority,organizationId:otherOrg})).rejects.toThrow("scope denied");
    await expect(ingestUsageEvent(client,{...signed,payload:{...body.payload,capabilityKey:"other-capability"}},authority)).rejects.toThrow("signature");
    await expect(ingestUsageEvent(client,signEventEnvelope({...body,payload:{...body.payload,capabilityKey:"other-capability"}},authority.keyId,key),authority)).rejects.toThrow("idempotency conflict");
    const unknown = signEventEnvelope({...body,eventId:createCanonicalId("event"),source:{system:"scalar",eventId:"source-2"},idempotencyKey:"operation-2",payload:{...body.payload,meterKey:"unregistered"}},authority.keyId,key);
    expect((await ingestUsageEvent(client,unknown,authority)).disposition).toBe("quarantined");
    const humanBody: EventEnvelopeV1 = {...body,eventId:createCanonicalId("event"),source:{system:"scalar",eventId:"human-1"},idempotencyKey:"human-1",actor:{type:"human",userId:user,membershipId:member},payload:{...body.payload,membershipId:member}};
    // Historical membership remains a valid attribution after suspension.
    expect((await ingestUsageEvent(client,signEventEnvelope(humanBody,authority.keyId,key),authority)).disposition).toBe("accepted");
    for (const actorUser of [createCanonicalId("user"),differentUser]) {
      const invalid = {...humanBody,eventId:createCanonicalId("event"),source:{system:"scalar",eventId:"wrong-human"},idempotencyKey:"wrong-human",actor:{type:"human" as const,userId:actorUser,membershipId:member}};
      await expect(ingestUsageEvent(client,signEventEnvelope(invalid,authority.keyId,key),authority)).rejects.toThrow("usage_human_membership_fk");
    }
    for (const attribution of [{membershipId:foreignMember,teamId:null},{membershipId:null,teamId:foreignTeam}]) {
      const invalid = {...body,eventId:createCanonicalId("event"),source:{system:"scalar",eventId:crypto.randomUUID()},idempotencyKey:crypto.randomUUID(),payload:{...body.payload,...attribution}};
      await expect(ingestUsageEvent(client,signEventEnvelope(invalid,authority.keyId,key),authority)).rejects.toThrow("foreign key constraint");
    }
    // Database enforcement survives callers bypassing the TypeScript parser.
    await client.query("SAVEPOINT malformed_human");
    await expect(client.query(`INSERT INTO usage_events (event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,idempotency_key,membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,received_at,disposition,envelope,signature) SELECT
      $1,event.organization_id,event.product_id,event.product_instance_id,event.environment,event.source_system,$2,$2,
      NULL,event.team_id,event.meter_key,event.meter_version,event.quantity,event.unit,event.occurred_at,event.reported_at,event.received_at,event.disposition,
      jsonb_set(event.envelope,'{actor}',jsonb_build_object('type','human','userId',$3::text)),event.signature
      FROM usage_events event WHERE event.event_id=$4`,[createCanonicalId("event"),crypto.randomUUID(),user,body.eventId])).rejects.toThrow("usage_human_attribution_consistent");
    await client.query("ROLLBACK TO SAVEPOINT malformed_human");
    await client.query("RELEASE SAVEPOINT malformed_human");
    const rows = await client.query("SELECT envelope,quantity::text AS quantity FROM usage_events WHERE event_id=$1",[body.eventId]);
    expect(rows.rows[0].envelope).toEqual(body);
    expect(rows.rows[0].quantity).toBe("1.000000");
    await client.query("SELECT set_config('company_human.organization_id',$1,true)",[otherOrg]);
    expect((await client.query("SELECT * FROM usage_events")).rowCount).toBe(0);
    await client.query("RESET ROLE");
    await client.query("SAVEPOINT rewrite");
    await expect(client.query("UPDATE usage_events SET quantity=3 WHERE event_id=$1",[body.eventId])).rejects.toThrow("immutable");
    await client.query("ROLLBACK TO SAVEPOINT rewrite");
    await expect(client.query("DELETE FROM meter_definitions WHERE product_id=$1",[product])).rejects.toThrow("immutable");
  } finally { await client.query("ROLLBACK"); await client.end(); }
});
