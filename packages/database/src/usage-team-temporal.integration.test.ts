import { createCanonicalId, type EventEnvelopeV1 } from "@company-human/contracts";
import { signEventEnvelope } from "@company-human/contracts/signing";
import { Client, type DatabaseError } from "pg";
import { expect, it } from "vitest";
import { ingestUsageEvent } from "./usage-ingestion.js";
import { releaseUsageInTransaction } from "./usage-quarantine.js";

const databaseUrl = process.env.DATABASE_URL;

it.skipIf(!databaseUrl)("rejects unverified human team time even through SQL, but preserves valid delayed use and exact retries", async () => {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query("BEGIN");
  try {
    const user = createCanonicalId("user"), org = createCanonicalId("organization");
    const member = createCanonicalId("membership"), team = createCanonicalId("team");
    const otherTeam = createCanonicalId("team"), product = createCanonicalId("product");
    const instance = createCanonicalId("productInstance"), role = createCanonicalId("role");
    await db.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://temporal.test',$1,'Temporal owner','active',1)", [user]);
    await db.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,$2,'Temporal org',$3)", [org, org.replaceAll("_", "-"), user]);
    await db.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,'owner')", [role, org]);
    await db.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) SELECT $1,$2,permission_key FROM role_permission_defaults WHERE role_key='owner'", [org, role]);
    await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'owner','active')", [member, org, user]);
    await db.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'Assigned')", [team, org]);
    await db.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'Other')", [otherTeam, org]);
    await db.query("INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role) VALUES($1,$2,$3,'member')", [org, team, member]);
    await db.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'Temporal product')", [product, `temporal-${crypto.randomUUID()}`]);
    await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'main','connected',$4)", [instance, org, product, user]);
    await db.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'actions',1,'action','sum','Actions')", [product]);

    const instants = (await db.query<{ before_start: string; within_active: string }>(
      `SELECT (started_at - interval '1 microsecond')::text AS before_start,
         clock_timestamp()::text AS within_active
       FROM company_human_private.team_assignment_active WHERE team_id=$1 AND membership_id=$2`, [team, member])).rows[0]!;
    const insertDirect = async (at: string, targetTeam = team, disposition = "accepted", meterKey = "actions") => {
      const eventId = createCanonicalId("event"), sourceId = crypto.randomUUID();
      const envelope = {
        actor: { type: "human", userId: user, membershipId: member },
        payload: { membershipId: member, teamId: targetTeam },
      };
      await db.query(`INSERT INTO usage_events
        (event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,idempotency_key,
         membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,disposition,envelope,signature)
        VALUES($1,$2,$3,$4,'test','temporal-fixture',$5,$5,$6,$7,$8,1,1,'action',$9,clock_timestamp(),$10,$11,'{}')`,
      [eventId, org, product, instance, sourceId, member, targetTeam, meterKey, at, disposition, JSON.stringify(envelope)]);
      return eventId;
    };
    const rejectTemporal = async (at: string, targetTeam = team) => {
      await db.query("SAVEPOINT temporal_rejection");
      try {
        await insertDirect(at, targetTeam);
        throw new Error("Unexpectedly accepted invalid temporal attribution");
      } catch (error) {
        expect((error as DatabaseError).code).toBe("CHT01");
        expect((error as DatabaseError).constraint).toBe("usage_team_temporal");
      } finally {
        await db.query("ROLLBACK TO SAVEPOINT temporal_rejection");
        await db.query("RELEASE SAVEPOINT temporal_rejection");
      }
    };

    await db.query("SET LOCAL ROLE company_human_usage_ingest");
    await db.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.product_instance_id',$2,true),set_config('company_human.integration_environment','test',true)", [org, instance]);
    expect(await insertDirect(instants.within_active)).toMatch(/^ch_evt_/);
    await rejectTemporal(instants.before_start);
    await rejectTemporal("2099-01-01T00:00:00Z");
    await rejectTemporal(instants.within_active, otherTeam);
    await db.query("SAVEPOINT private_history_read");
    await expect(db.query("SELECT * FROM company_human_private.team_assignment_active LIMIT 1")).rejects.toThrow("permission denied");
    await db.query("ROLLBACK TO SAVEPOINT private_history_read");
    await db.query("RESET ROLE");

    // A signed event is still an exact duplicate after its team assignment ends.
    const occurredAt = (await db.query<{ at: string }>("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS at")).rows[0]!.at;
    const authority = { keyId: "temporal-key", key: new Uint8Array(32).fill(11), organizationId: org,
      productId: product, productInstanceId: instance, environment: "test" as const, sourceSystem: "temporal-fixture" };
    const body: EventEnvelopeV1 = { schemaVersion: 1, eventId: createCanonicalId("event"), organizationId: org,
      productId: product, eventType: "usage.recorded", source: { system: "temporal-fixture", eventId: crypto.randomUUID() },
      actor: { type: "human", userId: user, membershipId: member }, environment: "test", occurredAt,
      reportedAt: occurredAt, idempotencyKey: crypto.randomUUID(),
      payload: { productInstanceId: instance, membershipId: member, teamId: team, meterKey: "actions", meterVersion: 1,
        quantity: "1.000000", unit: "action", sourceCost: null, customerRateVersion: null, metadata: {} } };
    const signed = signEventEnvelope(body, authority.keyId, authority.key);
    await db.query("SET LOCAL ROLE company_human_usage_ingest");
    expect(await ingestUsageEvent(db, signed, authority)).toEqual({ eventId: body.eventId, disposition: "accepted", duplicate: false });
    await db.query("RESET ROLE");
    await db.query("UPDATE team_memberships SET ended_at=now() WHERE team_id=$1 AND membership_id=$2", [team, member]);
    const closed = (await db.query<{ end_at: string }>(
      "SELECT ended_at::text AS end_at FROM company_human_private.team_assignment_history WHERE team_id=$1 AND membership_id=$2", [team, member])).rows[0]!;

    await db.query("SET LOCAL ROLE company_human_usage_ingest");
    expect(await ingestUsageEvent(db, signed, authority)).toEqual({ eventId: body.eventId, disposition: "accepted", duplicate: true });
    await expect(ingestUsageEvent(db, signEventEnvelope({ ...body, payload: { ...body.payload, quantity: "2.000000" } }, authority.keyId, authority.key), authority))
      .rejects.toThrow("idempotency conflict");
    expect(await insertDirect(instants.within_active)).toMatch(/^ch_evt_/);
    await rejectTemporal(closed.end_at);
    await db.query("RESET ROLE");

    await db.query("SELECT pg_sleep(0.005)");
    await db.query("UPDATE team_memberships SET ended_at=NULL WHERE team_id=$1 AND membership_id=$2", [team, member]);
    const reopened = (await db.query<{ gap: string; reopened_at: string }>(
      `SELECT (h.ended_at + (a.started_at - h.ended_at)/2)::text AS gap,
         a.started_at::text AS reopened_at
       FROM company_human_private.team_assignment_history h
       JOIN company_human_private.team_assignment_active a USING (organization_id,team_id,membership_id)
       WHERE a.team_id=$1 AND a.membership_id=$2`, [team, member])).rows[0]!;
    await db.query("SET LOCAL ROLE company_human_usage_ingest");
    await rejectTemporal(reopened.gap);
    expect(await insertDirect(reopened.reopened_at)).toMatch(/^ch_evt_/);
    await db.query("RESET ROLE");

    // Simulate a quarantined row that existed before 0069's INSERT trigger.
    // A later exact meter registration must not make its false team claim releasable.
    await db.query("ALTER TABLE public.usage_events DISABLE TRIGGER usage_team_temporal_guard");
    const legacyEvent = await insertDirect(instants.before_start, team, "quarantined", "legacy-actions");
    await db.query("ALTER TABLE public.usage_events ENABLE TRIGGER usage_team_temporal_guard");
    await db.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'legacy-actions',1,'action','sum','Legacy actions')", [product]);
    await db.query("SET LOCAL ROLE company_human_service");
    await db.query("SAVEPOINT denied_release");
    try {
      await releaseUsageInTransaction(db, { actorUserId: user, organizationId: org, eventId: legacyEvent, reason: "Late meter registration" });
      throw new Error("Unexpectedly released invalid historical attribution");
    } catch (error) {
      expect((error as DatabaseError).code).toBe("CHT01");
      expect((error as DatabaseError).constraint).toBe("usage_team_temporal");
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT denied_release");
      await db.query("RELEASE SAVEPOINT denied_release");
    }
    expect((await db.query("SELECT count(*)::int AS count FROM usage_quarantine_releases WHERE event_id=$1", [legacyEvent])).rows[0]!.count).toBe(0);
    await db.query("RESET ROLE");

    const delayedEvent = await insertDirect(instants.within_active, team, "quarantined", "legacy-actions");
    await db.query("SET LOCAL ROLE company_human_service");
    expect(await releaseUsageInTransaction(db, { actorUserId: user, organizationId: org, eventId: delayedEvent, reason: "Verified delayed event" }))
      .toEqual({ released: true });
    await db.query("RESET ROLE");
    const guard = (await db.query("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='company_human_usage_team_guard'")).rows[0]!;
    expect(guard).toEqual({ rolcanlogin: false, rolsuper: false, rolbypassrls: false });
    const callers = (await db.query<{ ingest_can_call: boolean; service_can_call: boolean; service_can_assume_guard: boolean }>(
      `SELECT has_function_privilege('company_human_usage_ingest',
          'company_human_private.assert_usage_team_temporal(text,text,text,timestamptz)','EXECUTE') AS ingest_can_call,
        has_function_privilege('company_human_service',
          'company_human_private.assert_usage_team_temporal(text,text,text,timestamptz)','EXECUTE') AS service_can_call,
        pg_has_role('company_human_service','company_human_usage_team_guard','SET') AS service_can_assume_guard`)).rows[0]!;
    expect(callers).toEqual({ ingest_can_call: false, service_can_call: false, service_can_assume_guard: false });
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
