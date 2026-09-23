import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { BudgetReservationIntentV1Schema, budgetReservationRequestFingerprintV1,
  createCanonicalId, evaluateBudgetConsumptionV1, projectBudgetReservationV1 } from "@company-human/contracts";
import { runMigrations } from "./migrate.js";
import { seedReferenceProducts } from "./seed.js";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.COMPANY_HUMAN_BUDGET_RESERVATION_STORAGE_TEST === "1";

it.skipIf(!databaseUrl || !enabled)("stores immutable, tenant bound reservation intent and append only history", async () => {
  const target = new URL(databaseUrl!);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    !target.pathname.slice(1).startsWith("company_human_0075_")) {
    throw new Error("Reservation storage test requires a disposable loopback company_human_0075_ database");
  }
  expect(await runMigrations(databaseUrl!)).toContain("0075_budget_reservation_storage.sql");
  expect(await runMigrations(databaseUrl!)).toEqual([]);
  await seedReferenceProducts(databaseUrl!);

  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query("BEGIN");
  const suffix = randomBytes(6).toString("hex");
  const user = createCanonicalId("user");
  const organization = createCanonicalId("organization");
  const otherOrganization = createCanonicalId("organization");
  const product = createCanonicalId("product");
  const otherProduct = createCanonicalId("product");
  const instance = createCanonicalId("productInstance");
  const foreignInstance = createCanonicalId("productInstance");
  const membership = createCanonicalId("membership");
  const foreignMembership = createCanonicalId("membership");
  const role = createCanonicalId("role");
  const foreignRole = createCanonicalId("role");
  const team = createCanonicalId("team");
  const foreignTeam = createCanonicalId("team");
  const reservation = createCanonicalId("budgetReservation");
  const event = createCanonicalId("event");
  const provenance = { auditId: createCanonicalId("audit"), actor: { type: "service", id: "reservation-fixture" }, requestId: "request-1" };
  const request = {
    schemaVersion: 1,
    operation: { schemaVersion: 1, organizationId: organization, productId: product,
      productInstanceId: instance, membershipId: null, operationTeam: null,
      capabilityKey: null, meter: { meterKey: "requests", meterVersion: 1, unit: "request" } },
    source: { system: "fixture", operationId: "operation-1" }, environment: "test",
    aggregation: "sum", requestedQuantity: "1.000001", idempotencyKey: "transport-1",
  } as const;
  const evaluatedAt = new Date(Date.now() - 1000).toISOString();
  const from = `${evaluatedAt.slice(0,10)}T00:00:00Z`;
  const until = new Date(Date.parse(from) + 86400000).toISOString();
  const scope = { kind: "organization" } as const;
  const policy = { schemaVersion: 1, policyId: createCanonicalId("budget"), revision: 1,
    organizationId: organization, productId: product, meter: request.operation.meter,
    window: "utc_day", maximumQuantity: "10", action: "warning", scope } as const;
  const evaluation = evaluateBudgetConsumptionV1(request.operation, [policy], [{
    schemaVersion: 1, organizationId: organization, productId: product,
    meter: request.operation.meter, window: "utc_day", scope, quantity: "0",
    environment: "test", evaluatedAt, from, until, aggregation: "sum",
  }], { environment: "test", aggregation: "sum", evaluatedAt });
  const projection = projectBudgetReservationV1(request, evaluation, [{
    schemaVersion: 1, organizationId: organization, productId: product,
    meter: request.operation.meter, environment: "test", aggregation: "sum",
    evaluatedAt, window: "utc_day", scope, from, until, outstandingQuantity: "0",
  }]);
  const insertIntent = `INSERT INTO budget_reservation_intents
    (reservation_id,organization_id,product_id,product_instance_id,membership_id,team_id,
     operation_team_membership_id,capability_key,meter_key,meter_version,unit,environment,
     requested_quantity,source_system,source_operation_id,idempotency_key,request_fingerprint,
     request_payload,projection,provenance,recorded_at,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
      $18::jsonb,$19::jsonb,$20::jsonb,'2000-01-01',transaction_timestamp()+interval '1 hour')`;
  const values = [reservation, organization, product, instance, null, null, null, null,
    "requests", 1, "request", "test", "1.000001", "fixture", "operation-1", "transport-1",
    budgetReservationRequestFingerprintV1(request), JSON.stringify(request), JSON.stringify(projection), JSON.stringify(provenance)];
  const insertLedger = `INSERT INTO budget_reservation_ledger
    (reservation_id,organization_id,product_id,environment,sequence,entry_kind,from_state,
     to_state,after_state,usage_event_id,usage_evidence,provenance,reason,occurred_at)
    VALUES ($1,$2,$3,'test',$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'2000-01-01')`;
  const ledger = (sequence: number, kind: string, from: string | null, to: string | null,
    after: string | null, usageEvent: string | null = null, evidence: object | null = null,
    reservationId: string = reservation) =>
    [reservationId, organization, product, sequence, kind, from, to, after, usageEvent,
      evidence === null ? null : JSON.stringify(evidence), JSON.stringify(provenance), "fixture reason"];
  let savepoint = 0;
  async function rejected(sql: string, args: unknown[], pattern?: RegExp) {
    const name = `reservation_rejected_${++savepoint}`;
    await db.query(`SAVEPOINT ${name}`);
    try { await expect(db.query(sql, args)).rejects.toThrow(pattern); }
    finally { await db.query(`ROLLBACK TO SAVEPOINT ${name}`); }
  }

  try {
    await db.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://reservation.test',$1,'Fixture','active',1)", [user]);
    await db.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,$2,'Fixture',$3),($4,$5,'Foreign',$3)", [organization, `res-a-${suffix}`, user, otherOrganization, `res-b-${suffix}`]);
    await db.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,'owner'),($3,$4,'owner')", [role, organization, foreignRole, otherOrganization]);
    await db.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key,role_id) VALUES($1,$2,$3,'active','owner',$4),($5,$6,$3,'active','owner',$7)", [membership, organization, user, role, foreignMembership, otherOrganization, foreignRole]);
    await db.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'Fixture'),($3,$4,'Foreign')", [product, `res-a-${suffix}`, otherProduct, `res-b-${suffix}`]);
    await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'primary','connected',$4),($5,$6,$3,'foreign','connected',$4)", [instance, organization, product, user, foreignInstance, otherOrganization]);
    await db.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'Fixture'),($3,$4,'Foreign')", [team, organization, foreignTeam, otherOrganization]);
    await db.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'requests',1,'request','sum','Requests'),($2,'requests',1,'request','sum','Requests'),($1,'peak',1,'request','maximum','Peak')", [product, otherProduct]);
    await db.query(insertIntent, values);
    const stored = (await db.query<{ recorded_at: Date; expires_at: Date }>(
      "SELECT recorded_at,expires_at FROM budget_reservation_intents WHERE reservation_id=$1", [reservation])).rows[0]!;
    expect(stored.recorded_at.getUTCFullYear()).toBeGreaterThan(2020);
    expect(stored.expires_at.getTime()).toBeGreaterThan(stored.recorded_at.getTime());
    expect(BudgetReservationIntentV1Schema.parse({ schemaVersion: 1, reservationId: reservation,
      request, requestFingerprint: values[16], projection, initialState: "requested",
      recordedAt: stored.recorded_at.toISOString(), expiresAt: stored.expires_at.toISOString(),
      clockSource: "database_transaction", provenance }).reservationId).toBe(reservation);

    await rejected(insertIntent, [createCanonicalId("budgetReservation"), ...values.slice(1)], /unique/i);
    expect((await db.query("SELECT reservation_id,request_fingerprint FROM budget_reservation_intents WHERE organization_id=$1 AND product_id=$2 AND environment='test' AND source_system='fixture' AND source_operation_id='operation-1'", [organization, product])).rows[0])
      .toEqual({ reservation_id: reservation, request_fingerprint: values[16] });
    const duplicateSource = [createCanonicalId("budgetReservation"), ...values.slice(1)];
    duplicateSource[15] = "transport-2";
    duplicateSource[17] = JSON.stringify({ ...request, idempotencyKey: "transport-2" });
    await rejected(insertIntent, duplicateSource, /unique/i);
    const duplicateTransport = [...values];
    duplicateTransport[0] = createCanonicalId("budgetReservation");
    duplicateTransport[14] = "operation-2";
    duplicateTransport[17] = JSON.stringify({ ...request, source: { ...request.source, operationId: "operation-2" } });
    await rejected(insertIntent, duplicateTransport, /unique/i);
    expect((await db.query("SELECT count(*)::int AS n FROM budget_reservation_intents WHERE organization_id=$1", [organization])).rows[0]?.n).toBe(1);
    for (const [position, replacement, operationPatch, projectionPatch] of [
      [3, foreignInstance, { productInstanceId: foreignInstance }, {}],
      [4, foreignMembership, { membershipId: foreignMembership }, {}],
      [5, foreignTeam, { operationTeam: { teamId: foreignTeam, organizationId: organization, membershipId: null } }, {}],
      [8, "unknown", { meter: { ...request.operation.meter, meterKey: "unknown" } },
        { meter: { ...projection.meter, meterKey: "unknown" } }],
      [8, "peak", { meter: { ...request.operation.meter, meterKey: "peak" } },
        { meter: { ...projection.meter, meterKey: "peak" } }],
      [10, "different", { meter: { ...request.operation.meter, unit: "different" } },
        { meter: { ...projection.meter, unit: "different" } }],
      [2, otherProduct, { productId: otherProduct }, { productId: otherProduct }],
    ] as const) {
      const invalid = [...values];
      invalid[position] = replacement; invalid[0] = createCanonicalId("budgetReservation");
      invalid[18] = JSON.stringify({ ...projection, ...projectionPatch });
      invalid[14] = `different-operation-${position}`;
      invalid[15] = `different-transport-${position}`;
      invalid[17] = JSON.stringify({ ...request, source: { ...request.source, operationId: invalid[14] },
        idempotencyKey: invalid[15], operation: { ...request.operation, ...operationPatch } });
      await rejected(insertIntent, invalid, /foreign key/i);
    }
    await rejected(insertIntent, values.map((value, index) => index === 12 ? "0" : value));
    const control = [...values];
    control[0] = createCanonicalId("budgetReservation"); control[14] = "operation\ncontrol";
    control[15] = "control-transport";
    control[17] = JSON.stringify({ ...request, source: { ...request.source, operationId: control[14] },
      idempotencyKey: control[15] });
    await rejected(insertIntent, control, /check constraint/i);
    const emptyProjection = [...values];
    emptyProjection[0] = createCanonicalId("budgetReservation");
    emptyProjection[14] = "empty-projection";
    emptyProjection[15] = "empty-projection";
    emptyProjection[17] = JSON.stringify({ ...request,
      source: { ...request.source, operationId: emptyProjection[14] },
      idempotencyKey: emptyProjection[15] });
    emptyProjection[18] = JSON.stringify({ ...projection, constraints: [] });
    await rejected(insertIntent, emptyProjection, /check constraint/i);
    await rejected("UPDATE budget_reservation_intents SET expires_at=expires_at+interval '1 hour' WHERE reservation_id=$1", [reservation], /immutable/i);
    await rejected("DELETE FROM budget_reservation_intents WHERE reservation_id=$1", [reservation], /immutable/i);

    await rejected(insertLedger, ledger(1, "transition", "reserved", "settled", null));
    await rejected(insertLedger, ledger(1, "transition", "requested", "reserved", null, event));
    await db.query(insertLedger, ledger(1, "transition", "requested", "reserved", null));
    await rejected(insertLedger, ledger(3, "transition", "reserved", "released", null));
    await rejected(insertLedger, ledger(2, "transition", "reserved", "settled", null));
    await db.query(insertLedger, ledger(2, "transition", "reserved", "released", null));
    await rejected(insertLedger, ledger(3, "transition", "released", "settled", null));
    await rejected("UPDATE budget_reservation_ledger SET reason='changed' WHERE reservation_id=$1", [reservation], /immutable/i);
    await rejected("DELETE FROM budget_reservation_ledger WHERE reservation_id=$1", [reservation], /immutable/i);

    // Administrative fixture exercises relational binding only. It does not
    // establish signature verification or provider operation authenticity.
    const insertAcceptedFixture = (eventId: string, sourceEventId: string,
      operationId: string, quantity: string) => db.query(`INSERT INTO usage_events
      (event_id,organization_id,product_id,product_instance_id,environment,source_system,
       source_event_id,idempotency_key,membership_id,team_id,meter_key,meter_version,
       quantity,unit,occurred_at,reported_at,disposition,envelope,signature)
      VALUES($1,$2,$3,$4,'test','fixture',$5,$5,NULL,NULL,'requests',1,
        $6,'request',transaction_timestamp(),transaction_timestamp(),'accepted',$7::jsonb,'{}'::jsonb)`,
    [eventId, organization, product, instance, sourceEventId, quantity,
      JSON.stringify({ source: { operationId } })]);
    await rejected(`INSERT INTO usage_events
      (event_id,organization_id,product_id,product_instance_id,environment,source_system,
       source_event_id,idempotency_key,membership_id,team_id,meter_key,meter_version,
       quantity,unit,occurred_at,reported_at,disposition,envelope,signature)
      VALUES($1,$2,$3,$4,'test','fixture','nan-event','nan-event',NULL,NULL,'requests',1,
        'NaN'::numeric,'request',transaction_timestamp(),transaction_timestamp(),'accepted',$5::jsonb,'{}'::jsonb)`,
    [createCanonicalId("event"), organization, product, instance,
      JSON.stringify({ source: { operationId: "operation-1" } })], /usage_events_finite_quantity/);
    await insertAcceptedFixture(event, "event-1", "operation-1", "1.000001");
    const eventTimestamp = (await db.query<{ at: string }>(
      `SELECT to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
       FROM usage_events WHERE event_id=$1`, [event])).rows[0]!.at;
    const evidence = { schemaVersion: 1, eventId: event, organizationId: organization,
      productId: product, productInstanceId: instance, membershipId: null, teamId: null,
      capabilityKey: null, meter: request.operation.meter, environment: "test",
      source: request.source, sourceEventId: "event-1", actualQuantity: "1.000001",
      ingestionDisposition: "accepted", occurredAt: eventTimestamp,
      reportedAt: eventTimestamp };
    await rejected(insertLedger, ledger(3, "late_reconciliation", null, null, "expired", event, evidence));
    await rejected(insertLedger, ledger(3, "late_reconciliation", null, null, "released", event,
      { ...evidence, organizationId: otherOrganization }));
    await rejected(insertLedger, ledger(3, "late_reconciliation", null, null, "released", event,
      { ...evidence, ingestionDisposition: undefined }), /usage event binding/i);
    await rejected(insertLedger, ledger(3, "late_reconciliation", null, null, "released", event,
      { ...evidence, actualQuantity: "NaN" }), /usage event binding/i);
    await rejected(insertLedger, ledger(3, "late_reconciliation", null, null, "released", event,
      { ...evidence, actualQuantity: "1.0000001" }), /usage event binding/i);
    await db.query(insertLedger, ledger(3, "late_reconciliation", null, null, "released", event, evidence));
    await rejected(insertLedger, ledger(4, "late_reconciliation", null, null, "released", event, evidence), /unique/i);
    expect((await db.query("SELECT sequence,schema_version,entry_kind FROM budget_reservation_ledger WHERE reservation_id=$1 ORDER BY sequence", [reservation])).rows)
      .toEqual([{ sequence: 1, schema_version: 1, entry_kind: "transition" },
        { sequence: 2, schema_version: 1, entry_kind: "transition" },
        { sequence: 3, schema_version: 1, entry_kind: "late_reconciliation" }]);

    const multiReservation = createCanonicalId("budgetReservation");
    const multiRequest = { ...request, source: { ...request.source, operationId: "operation-multi" },
      idempotencyKey: "transport-multi" };
    const multiProjection = projectBudgetReservationV1(multiRequest, evaluation, [{
      schemaVersion: 1, organizationId: organization, productId: product,
      meter: request.operation.meter, environment: "test", aggregation: "sum",
      evaluatedAt, window: "utc_day", scope, from, until, outstandingQuantity: "0",
    }]);
    const multiValues = [...values];
    multiValues[0] = multiReservation;
    multiValues[14] = multiRequest.source.operationId;
    multiValues[15] = multiRequest.idempotencyKey;
    multiValues[16] = budgetReservationRequestFingerprintV1(multiRequest);
    multiValues[17] = JSON.stringify(multiRequest);
    multiValues[18] = JSON.stringify(multiProjection);
    await db.query(insertIntent, multiValues);
    const firstEvent = createCanonicalId("event");
    const secondEvent = createCanonicalId("event");
    await insertAcceptedFixture(firstEvent, "multi-1", "operation-multi", "1");
    await insertAcceptedFixture(secondEvent, "multi-2", "operation-multi", "2");
    const firstEvidence = { ...evidence, eventId: firstEvent, source: multiRequest.source,
      sourceEventId: "multi-1", actualQuantity: "1" };
    const secondEvidence = { ...evidence, eventId: secondEvent, source: multiRequest.source,
      sourceEventId: "multi-2", actualQuantity: "2" };
    await db.query(insertLedger, ledger(1, "transition", "requested", "reserved", null,
      null, null, multiReservation));
    await db.query(insertLedger, ledger(2, "transition", "reserved", "settled", null,
      firstEvent, firstEvidence, multiReservation));
    await db.query(insertLedger, ledger(3, "late_reconciliation", null, null, "settled",
      secondEvent, secondEvidence, multiReservation));
    await rejected(insertLedger, ledger(4, "late_reconciliation", null, null, "settled",
      firstEvent, firstEvidence, multiReservation), /unique/i);
    await rejected(insertLedger, ledger(4, "late_reconciliation", null, null, "released",
      createCanonicalId("event"), secondEvidence, multiReservation));
    expect((await db.query(`SELECT sequence,entry_kind,to_state,after_state,usage_event_id
      FROM budget_reservation_ledger WHERE reservation_id=$1 ORDER BY sequence`, [multiReservation])).rows)
      .toEqual([{ sequence: 1, entry_kind: "transition", to_state: "reserved", after_state: null, usage_event_id: null },
        { sequence: 2, entry_kind: "transition", to_state: "settled", after_state: null, usage_event_id: firstEvent },
        { sequence: 3, entry_kind: "late_reconciliation", to_state: null, after_state: "settled", usage_event_id: secondEvent }]);

    for (const table of ["budget_reservation_intents", "budget_reservation_ledger"]) {
      const flags = (await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass", [`public.${table}`])).rows[0];
      expect(flags).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
      const publicGrants = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_class c,
          LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
          WHERE c.oid=$1::regclass AND a.grantee=0`, [`public.${table}`])).rows[0];
      expect(publicGrants?.n).toBe(0);
      for (const roleName of ["company_human_app", "company_human_service", "company_human_usage_ingest", "company_human_budget_snapshot"]) {
        const privileges = (await db.query<{ readable: boolean; writable: boolean }>(
          "SELECT has_table_privilege($1,$2,'SELECT') AS readable,has_table_privilege($1,$2,'INSERT') AS writable",
          [roleName, `public.${table}`])).rows[0];
        expect(privileges).toEqual({ readable: false, writable: false });
        for (const sql of [`SELECT * FROM public.${table} LIMIT 1`,
          `INSERT INTO public.${table} DEFAULT VALUES`]) {
          const name = `role_denial_${++savepoint}`;
          await db.query(`SAVEPOINT ${name}`);
          await db.query(`SET LOCAL ROLE ${roleName}`);
          await expect(db.query(sql)).rejects.toThrow(/permission denied/i);
          await db.query(`ROLLBACK TO SAVEPOINT ${name}`);
        }
      }
      expect((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND tablename=$1", [table])).rows[0]?.n).toBe(0);
    }
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
