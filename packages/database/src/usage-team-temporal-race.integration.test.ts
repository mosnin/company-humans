import { createCanonicalId, type EventEnvelopeV1 } from "@company-human/contracts";
import { signEventEnvelope } from "@company-human/contracts/signing";
import { Client, type DatabaseError } from "pg";
import { expect, it } from "vitest";
import { ingestUsageEvent } from "./usage-ingestion.js";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.COMPANY_HUMAN_TEMPORAL_RACE_TEST === "1";

/** This test commits fixtures to make them visible to two independent sessions.
 * Run only against a dedicated loopback database and drop that database after it.
 */
it.skipIf(!databaseUrl || !enabled)("serializes team removal and concurrent exact signed usage retries", async () => {
  const target = new URL(databaseUrl!);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)
    || !target.pathname.slice(1).startsWith("company_human_temporal_race_")) {
    throw new Error("Temporal race fixture requires a disposable loopback database");
  }
  const observer = new Client({ connectionString: databaseUrl });
  const inserter = new Client({ connectionString: databaseUrl });
  const remover = new Client({ connectionString: databaseUrl });
  await Promise.all([observer.connect(), inserter.connect(), remover.connect()]);
  try {
    const user = createCanonicalId("user"), org = createCanonicalId("organization");
    const member = createCanonicalId("membership"), role = createCanonicalId("role");
    const product = createCanonicalId("product"), instance = createCanonicalId("productInstance");
    const [insertFirstTeam, removeFirstTeam, retryTeam] = [
      createCanonicalId("team"), createCanonicalId("team"), createCanonicalId("team"),
    ] as const;
    await observer.query("BEGIN");
    await observer.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://temporal-race.test',$1,'Race owner','active',1)", [user]);
    await observer.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,$2,'Temporal race org',$3)", [org, org.replaceAll("_", "-"), user]);
    await observer.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,'owner')", [role, org]);
    await observer.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) SELECT $1,$2,permission_key FROM role_permission_defaults WHERE role_key='owner'", [org, role]);
    await observer.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'owner','active')", [member, org, user]);
    for (const [index, team] of [insertFirstTeam, removeFirstTeam, retryTeam].entries()) {
      await observer.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,$3)", [team, org, `Race ${index}`]);
      await observer.query("INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role) VALUES($1,$2,$3,'member')", [org, team, member]);
    }
    await observer.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'Temporal race product')", [product, `temporal-race-${crypto.randomUUID()}`]);
    await observer.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'main','connected',$4)", [instance, org, product, user]);
    await observer.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'actions',1,'action','sum','Actions')", [product]);
    await observer.query("COMMIT");

    const now = async () => (await observer.query<{ at: string }>(
      `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`)).rows[0]!.at;
    const beginIngest = async (client: Client) => {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL ROLE company_human_usage_ingest");
      await client.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.product_instance_id',$2,true),set_config('company_human.integration_environment','test',true)", [org, instance]);
    };
    const beginRemove = async (client: Client) => {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL ROLE company_human_service");
      await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [user, org]);
    };
    const insertDirect = async (client: Client, team: string, at: string) => {
      const event = createCanonicalId("event"), source = crypto.randomUUID();
      await client.query(`INSERT INTO usage_events
        (event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,idempotency_key,
         membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,disposition,envelope,signature)
        VALUES($1,$2,$3,$4,'test','race-fixture',$5,$5,$6,$7,'actions',1,1,'action',$8,clock_timestamp(),'accepted',$9,'{}')`,
      [event, org, product, instance, source, member, team, at,
        JSON.stringify({ actor: { type: "human", userId: user, membershipId: member }, payload: { membershipId: member, teamId: team } })]);
      return event;
    };
    const waitUntilBlockedBy = async (waitingPid: number, blockerPid: number) => {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const status = (await observer.query<{ wait_event_type: string | null; blockers: number[] }>(
          "SELECT wait_event_type, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1", [waitingPid])).rows[0];
        if (status?.wait_event_type === "Lock" && status.blockers.includes(blockerPid)) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Expected backend ${waitingPid} to wait on backend ${blockerPid} within 2 seconds`);
    };
    const expectTemporal = async (team: string, at: string) => {
      await beginIngest(inserter);
      try {
        await insertDirect(inserter, team, at);
        throw new Error("Unexpectedly accepted usage after team removal");
      } catch (error) {
        expect((error as DatabaseError).code).toBe("CHT01");
        expect((error as DatabaseError).constraint).toBe("usage_team_temporal");
      } finally {
        await inserter.query("ROLLBACK");
      }
    };

    // Insert wins: the guard holds a share lock until commit, so removal waits.
    const insertAt = await now();
    await beginIngest(inserter);
    const firstEvent = await insertDirect(inserter, insertFirstTeam, insertAt);
    const insertPid = (await inserter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await beginRemove(remover);
    const removePid = (await remover.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    const pendingRemoval = remover.query("UPDATE team_memberships SET ended_at=clock_timestamp() WHERE team_id=$1 AND membership_id=$2", [insertFirstTeam, member]);
    void pendingRemoval.catch(() => {});
    await waitUntilBlockedBy(removePid, insertPid);
    expect((await observer.query("SELECT 1 FROM usage_events WHERE event_id=$1", [firstEvent])).rowCount).toBe(0);
    await inserter.query("COMMIT");
    await pendingRemoval;
    await remover.query("COMMIT");
    const firstClosed = (await observer.query<{ ended_at: string; event_at: string }>(
      `SELECT h.ended_at::text, e.occurred_at::text AS event_at
       FROM company_human_private.team_assignment_history h
       JOIN usage_events e ON e.team_id=h.team_id AND e.membership_id=h.membership_id
       WHERE h.team_id=$1 AND e.event_id=$2`, [insertFirstTeam, firstEvent])).rows[0]!;
    expect(new Date(firstClosed.event_at).getTime()).toBeLessThan(new Date(firstClosed.ended_at).getTime());
    await expectTemporal(insertFirstTeam, firstClosed.ended_at);

    // Removal wins: a waiting insert rechecks the committed closed interval.
    const beforeRemoval = await now();
    await beginRemove(remover);
    await remover.query("UPDATE team_memberships SET ended_at=clock_timestamp() WHERE team_id=$1 AND membership_id=$2", [removeFirstTeam, member]);
    const blockingRemovalPid = (await remover.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await beginIngest(inserter);
    const waitingInsertPid = (await inserter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    const pendingInsert = insertDirect(inserter, removeFirstTeam, beforeRemoval);
    void pendingInsert.catch(() => {});
    await waitUntilBlockedBy(waitingInsertPid, blockingRemovalPid);
    await remover.query("COMMIT");
    const delayedEvent = await pendingInsert;
    await inserter.query("COMMIT");
    expect((await observer.query("SELECT 1 FROM usage_events WHERE event_id=$1", [delayedEvent])).rowCount).toBe(1);
    const secondEnd = (await observer.query<{ ended_at: string }>(
      "SELECT ended_at::text FROM company_human_private.team_assignment_history WHERE team_id=$1 AND membership_id=$2", [removeFirstTeam, member])).rows[0]!.ended_at;
    await expectTemporal(removeFirstTeam, secondEnd);
    await expectTemporal(removeFirstTeam, await now());

    // Two signed callers race on one exact envelope: one row, one duplicate.
    const authority = { keyId: "race-key", key: new Uint8Array(32).fill(17), organizationId: org, productId: product,
      productInstanceId: instance, environment: "test" as const, sourceSystem: "race-signed" };
    const occurredAt = await now();
    const body: EventEnvelopeV1 = { schemaVersion: 1, eventId: createCanonicalId("event"), organizationId: org,
      productId: product, eventType: "usage.recorded", source: { system: "race-signed", eventId: crypto.randomUUID() },
      actor: { type: "human", userId: user, membershipId: member }, environment: "test", occurredAt,
      reportedAt: occurredAt, idempotencyKey: crypto.randomUUID(),
      payload: { productInstanceId: instance, membershipId: member, teamId: retryTeam, meterKey: "actions", meterVersion: 1,
        quantity: "1.000000", unit: "action", sourceCost: null, customerRateVersion: null, metadata: {} } };
    const signed = signEventEnvelope(body, authority.keyId, authority.key);
    await beginIngest(inserter);
    const first = await ingestUsageEvent(inserter, signed, authority);
    const firstPid = (await inserter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await beginIngest(remover);
    const retryPid = (await remover.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    const pendingRetry = ingestUsageEvent(remover, signed, authority);
    void pendingRetry.catch(() => {});
    await waitUntilBlockedBy(retryPid, firstPid);
    await inserter.query("COMMIT");
    const duplicate = await pendingRetry;
    await remover.query("COMMIT");
    expect(first).toEqual({ eventId: body.eventId, disposition: "accepted", duplicate: false });
    expect(duplicate).toEqual({ eventId: body.eventId, disposition: "accepted", duplicate: true });
    expect((await observer.query<{ count: number }>("SELECT count(*)::int AS count FROM usage_events WHERE event_id=$1", [body.eventId])).rows[0]!.count).toBe(1);
  } finally {
    await Promise.allSettled([inserter.query("ROLLBACK"), remover.query("ROLLBACK"), observer.query("ROLLBACK")]);
    await Promise.allSettled([observer.end(), inserter.end(), remover.end()]);
  }
}, 20000);
