import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createCanonicalId, type EventEnvelopeV1 } from "@company-human/contracts";
import { canonicalEventEnvelopeV1, signEventEnvelope } from "@company-human/contracts/signing";
import { runMigrations } from "./migrate.js";
import { seedReferenceProducts } from "./seed.js";

const url = process.env.DATABASE_URL;
const enabled = process.env.COMPANY_HUMAN_VERIFIED_USAGE_TEST === "1";

it.skipIf(!url || !enabled)("stages a private signed usage verifier without runtime execution", async () => {
  const target = new URL(url!);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)
    || !target.pathname.slice(1).startsWith("company_human_0076_")) {
    throw new Error("Verified usage test requires a disposable loopback company_human_0076_ database");
  }
  await runMigrations(url!);
  expect(await runMigrations(url!)).toEqual([]);
  await seedReferenceProducts(url!);
  const db = new Client({ connectionString: url! });
  await db.connect();
  await db.query("BEGIN");
  try {
    const role = await db.query<{rolcanlogin:boolean;rolinherit:boolean;rolsuper:boolean;rolbypassrls:boolean;rolcreaterole:boolean;rolcreatedb:boolean;rolreplication:boolean;edges:string;unsafe_edges:string;migrator_super:boolean;can_set:boolean;can_use:boolean}>(`
      SELECT writer.rolcanlogin,writer.rolinherit,writer.rolsuper,writer.rolbypassrls,
        writer.rolcreaterole,writer.rolcreatedb,writer.rolreplication,
        (SELECT count(*)::text FROM pg_catalog.pg_auth_members AS edge
          WHERE edge.roleid=writer.oid OR edge.member=writer.oid) AS edges,
        (SELECT count(*)::text FROM pg_catalog.pg_auth_members AS edge
          WHERE (edge.roleid=writer.oid OR edge.member=writer.oid)
            AND NOT (edge.roleid=writer.oid AND edge.member=migrator.oid AND edge.admin_option
              AND NOT edge.inherit_option AND NOT edge.set_option)) AS unsafe_edges,
        migrator.rolsuper AS migrator_super,
        pg_catalog.pg_has_role(migrator.rolname,writer.rolname,'SET') AS can_set,
        pg_catalog.pg_has_role(migrator.rolname,writer.rolname,'USAGE') AS can_use
      FROM pg_catalog.pg_roles AS writer CROSS JOIN pg_catalog.pg_roles AS migrator
      WHERE writer.rolname='company_human_verified_usage_writer' AND migrator.rolname=current_user`);
    expect(role.rows).toHaveLength(1);
    expect(role.rows[0]).toMatchObject({rolcanlogin:false,rolinherit:false,rolsuper:false,
      rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,unsafe_edges:"0"});
    expect(Number(role.rows[0]!.edges)).toBeLessThanOrEqual(1);
    if (!role.rows[0]!.migrator_super) {
      expect(role.rows[0]!.can_set).toBe(false);
      expect(role.rows[0]!.can_use).toBe(false);
    }
    const runtimeRoles = await db.query<{rolname:string}>(`SELECT rolname FROM pg_catalog.pg_roles
      WHERE rolname LIKE 'company_human_%' AND rolname <> 'company_human_verified_usage_writer'`);
    for (const runtime of runtimeRoles.rows) {
      const acl = await db.query<{can_execute:boolean;can_read_keys:boolean;can_read_revocations:boolean}>(`
        SELECT pg_catalog.has_function_privilege($1,'company_human_private.ingest_verified_usage_v1(text,jsonb)','EXECUTE') AS can_execute,
          pg_catalog.has_table_privilege($1,'company_human_private.usage_signing_keys','SELECT') AS can_read_keys,
          pg_catalog.has_table_privilege($1,'company_human_private.usage_signing_key_revocations','SELECT') AS can_read_revocations`, [runtime.rolname]);
      expect(acl.rows, runtime.rolname).toEqual([{can_execute:false,can_read_keys:false,can_read_revocations:false}]);
    }
    const publicAcl = await db.query<{function_execute:boolean;key_read:boolean;revocation_read:boolean;writer_schema_create:boolean}>(`
      SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS routine,
        LATERAL pg_catalog.aclexplode(COALESCE(routine.proacl,pg_catalog.acldefault('f',routine.proowner))) AS acl
        WHERE routine.oid='company_human_private.ingest_verified_usage_v1(text,jsonb)'::regprocedure
          AND acl.grantee=0 AND acl.privilege_type='EXECUTE') AS function_execute,
        EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation,
          LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))) AS acl
          WHERE relation.oid='company_human_private.usage_signing_keys'::regclass
            AND acl.grantee=0 AND acl.privilege_type='SELECT') AS key_read,
        EXISTS (SELECT 1 FROM pg_catalog.pg_class AS relation,
          LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))) AS acl
          WHERE relation.oid='company_human_private.usage_signing_key_revocations'::regclass
            AND acl.grantee=0 AND acl.privilege_type='SELECT') AS revocation_read,
        pg_catalog.has_schema_privilege('company_human_verified_usage_writer','company_human_private','CREATE') AS writer_schema_create`);
    expect(publicAcl.rows).toEqual([{function_execute:false,key_read:false,revocation_read:false,writer_schema_create:false}]);
    const migrationSql = await readFile(new URL("../migrations/0076_verified_usage_ingest.sql", import.meta.url), "utf8");
    await db.query("SAVEPOINT elevated_role");
    await db.query("ALTER ROLE company_human_verified_usage_writer CREATEROLE");
    await expect(db.query(migrationSql)).rejects.toThrow(/Unsafe verified usage writer role/i);
    await db.query("ROLLBACK TO SAVEPOINT elevated_role");
    await db.query("RELEASE SAVEPOINT elevated_role");
    await db.query("SAVEPOINT member_role");
    await db.query("GRANT company_human_verified_usage_writer TO company_human_app");
    await expect(db.query(migrationSql)).rejects.toThrow(/Unsafe verified usage writer role/i);
    await db.query("ROLLBACK TO SAVEPOINT member_role");
    await db.query("RELEASE SAVEPOINT member_role");
    await db.query("SAVEPOINT inherited_role");
    await db.query("GRANT company_human_app TO company_human_verified_usage_writer");
    await expect(db.query(migrationSql)).rejects.toThrow(/Unsafe verified usage writer role/i);
    await db.query("ROLLBACK TO SAVEPOINT inherited_role");
    await db.query("RELEASE SAVEPOINT inherited_role");
    const user = createCanonicalId("user");
    const organization = createCanonicalId("organization");
    const otherOrganization = createCanonicalId("organization");
    const product = createCanonicalId("product");
    const instance = createCanonicalId("productInstance");
    await db.query("INSERT INTO public.users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://test.invalid',$1,'Verifier fixture','active',1)", [user]);
    for (const id of [organization, otherOrganization]) {
      await db.query("INSERT INTO public.organizations(id,slug,name,owner_user_id) VALUES($1,$2,'Verifier fixture',$3)", [id,`verified-${crypto.randomUUID()}`,user]);
    }
    await db.query("INSERT INTO public.products(id,product_key,display_name) VALUES($1,$2,'Verifier product')", [product,`verified-${crypto.randomUUID()}`]);
    await db.query("INSERT INTO public.product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'main','connected',$4)", [instance,organization,product,user]);
    await db.query("INSERT INTO public.meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'requests',1,'request','sum','Requests')", [product]);
    const key = new Uint8Array(32).fill(17);
    await db.query(`INSERT INTO company_human_private.usage_signing_keys
      (key_id,organization_id,product_id,product_instance_id,environment,source_system,secret,active_from)
      VALUES('fixture-key',$1,$2,$3,'test','scalar',$4,clock_timestamp()-interval '1 minute')`,
    [organization,product,instance,Buffer.from(key)]);
    const body: EventEnvelopeV1 = {
      schemaVersion:1,eventId:createCanonicalId("event"),organizationId:organization,productId:product,
      eventType:"usage.recorded",source:{system:"scalar",eventId:"source-1"},
      actor:{type:"service",id:"scalar-meter ✓"},environment:"test",
      occurredAt:"2026-01-01T00:00:00Z",reportedAt:"2026-01-02T00:00:00Z",
      idempotencyKey:"operation-1",payload:{productInstanceId:instance,membershipId:null,teamId:null,
        meterKey:"requests",capabilityKey:null,meterVersion:1,quantity:"1.000000",unit:"request",
        sourceCost:null,customerRateVersion:null,metadata:{ratio:1.25,label:"🌐"}},
    };
    const signed = signEventEnvelope(body,"fixture-key",key);
    const {signature,...signedBody} = signed;
    const call = (eventBody: EventEnvelopeV1, proof: object) => db.query<{event_id:string;disposition:string;duplicate:boolean}>(
      "SELECT * FROM company_human_private.ingest_verified_usage_v1($1,$2::jsonb)",
      [canonicalEventEnvelopeV1(eventBody),JSON.stringify(proof)]);
    const first = await call(signedBody,signature);
    expect(first.rows).toEqual([{event_id:body.eventId,disposition:"accepted",duplicate:false}]);
    expect((await call(signedBody,signature)).rows).toEqual([{event_id:body.eventId,disposition:"accepted",duplicate:true}]);
    const rejected = async (work: () => Promise<unknown>, message: RegExp) => {
      await db.query("SAVEPOINT rejected_verification");
      await expect(work()).rejects.toThrow(message);
      await db.query("ROLLBACK TO SAVEPOINT rejected_verification");
      await db.query("RELEASE SAVEPOINT rejected_verification");
    };
    await rejected(() => call({...signedBody,payload:{...body.payload,quantity:"2.000000"}},signature), /signature/i);
    await rejected(() => call({...signedBody,organizationId:otherOrganization},signature), /scope denied/i);
    const changed = signEventEnvelope({...body,payload:{...body.payload,quantity:"2.000000"}},"fixture-key",key);
    const {signature:changedSignature,...changedBody} = changed;
    await rejected(() => call(changedBody,changedSignature), /idempotency conflict/i);
    const unknown = signEventEnvelope({...body,eventId:createCanonicalId("event"),source:{system:"scalar",eventId:"source-2"},idempotencyKey:"operation-2",payload:{...body.payload,meterKey:"unregistered"}},"fixture-key",key);
    const {signature:unknownSignature,...unknownBody} = unknown;
    expect((await call(unknownBody,unknownSignature)).rows[0]).toMatchObject({disposition:"quarantined",duplicate:false});
    await rejected(() => call(signedBody,{...signature,digest:"0".repeat(64)}), /signature/i);
    await db.query("SAVEPOINT runtime_denial");
    await db.query("SET LOCAL ROLE company_human_usage_ingest");
    await expect(call(signedBody,signature)).rejects.toThrow(/permission denied/i);
    await db.query("ROLLBACK TO SAVEPOINT runtime_denial");
    await db.query("SAVEPOINT secret_denial");
    await db.query("SET LOCAL ROLE company_human_usage_ingest");
    await expect(db.query("SELECT key_id FROM company_human_private.usage_signing_keys")).rejects.toThrow(/permission denied/i);
    await db.query("ROLLBACK TO SAVEPOINT secret_denial");
    await db.query("INSERT INTO company_human_private.usage_signing_key_revocations(key_id,reason) VALUES('fixture-key','test rotation')");
    await rejected(() => call(signedBody,signature), /scope denied/i);
    await rejected(() => db.query("UPDATE company_human_private.usage_signing_keys SET active_until=clock_timestamp() WHERE key_id='fixture-key'"), /immutable/i);
    await rejected(() => db.query("DELETE FROM company_human_private.usage_signing_keys WHERE key_id='fixture-key'"), /immutable/i);
    await rejected(() => db.query("UPDATE company_human_private.usage_signing_key_revocations SET reason='rewrite' WHERE key_id='fixture-key'"), /immutable/i);
    await rejected(() => db.query("DELETE FROM company_human_private.usage_signing_key_revocations WHERE key_id='fixture-key'"), /immutable/i);
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});

it.skipIf(!url || !enabled)("fails closed when pgcrypto was installed outside public", async () => {
  const target = new URL(url!);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)
    || !target.pathname.slice(1).startsWith("company_human_0076_")) {
    throw new Error("Extension test requires a disposable loopback company_human_0076_ database");
  }
  const name = `company_human_0076_extension_${crypto.randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(url!);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const isolatedUrl = new URL(url!);
    isolatedUrl.pathname = `/${name}`;
    const isolated = new Client({ connectionString: isolatedUrl.toString() });
    await isolated.connect();
    try {
      await isolated.query("CREATE SCHEMA extensions");
      await isolated.query("CREATE EXTENSION pgcrypto WITH SCHEMA extensions");
    } finally { await isolated.end(); }
    await expect(runMigrations(isolatedUrl.toString())).rejects.toThrow(/pgcrypto installed in public schema/i);
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
});

it.skipIf(!url || !enabled)("migrates as a non-super CREATEROLE user without writer access", async () => {
  const target = new URL(url!);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)
    || !target.pathname.slice(1).startsWith("company_human_0076_")) {
    throw new Error("Non-super migration test requires a disposable loopback company_human_0076_ database");
  }
  const directory = await mkdtemp(join(tmpdir(), "company-human-0076-pg-"));
  const data = join(directory,"data");
  const bind = await new Promise<number>((resolve,reject) => {
    const server = createServer();
    server.once("error",reject);
    server.listen(0,"127.0.0.1",() => {
      const port = (server.address() as AddressInfo).port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
  let started = false;
  try {
    execFileSync("initdb",["-D",data,"-A","trust","--no-instructions"],{stdio:"ignore"});
    execFileSync("pg_ctl",["-D",data,"-o",`-h 127.0.0.1 -p ${bind}`,"-w","start"],{stdio:"ignore"});
    started = true;
    const admin = new Client({ connectionString:`postgresql://127.0.0.1:${bind}/postgres` });
    await admin.connect();
    try {
      await admin.query("CREATE ROLE ch_0076_migrator LOGIN CREATEROLE");
      await admin.query("CREATE DATABASE company_human_0076_non_super OWNER ch_0076_migrator");
    } finally { await admin.end(); }
    const migrated = new Client({ connectionString:`postgresql://ch_0076_migrator@127.0.0.1:${bind}/company_human_0076_non_super` });
    expect(await runMigrations(`postgresql://ch_0076_migrator@127.0.0.1:${bind}/company_human_0076_non_super`))
      .toContain("0076_verified_usage_ingest.sql");
    await migrated.connect();
    try {
      const result = await migrated.query<{rolsuper:boolean;rolcreaterole:boolean;edges:string;unsafe_edges:string;can_set:boolean;can_use:boolean}>(`
        SELECT migrator.rolsuper,migrator.rolcreaterole,
          (SELECT count(*)::text FROM pg_catalog.pg_auth_members AS edge
            WHERE edge.roleid=writer.oid OR edge.member=writer.oid) AS edges,
          (SELECT count(*)::text FROM pg_catalog.pg_auth_members AS edge
            WHERE (edge.roleid=writer.oid OR edge.member=writer.oid)
              AND NOT (edge.roleid=writer.oid AND edge.member=migrator.oid AND edge.admin_option
                AND NOT edge.inherit_option AND NOT edge.set_option)) AS unsafe_edges,
          pg_catalog.pg_has_role(migrator.rolname,writer.rolname,'SET') AS can_set,
          pg_catalog.pg_has_role(migrator.rolname,writer.rolname,'USAGE') AS can_use
        FROM pg_catalog.pg_roles AS migrator CROSS JOIN pg_catalog.pg_roles AS writer
        WHERE migrator.rolname='ch_0076_migrator' AND writer.rolname='company_human_verified_usage_writer'`);
      expect(result.rows).toEqual([{rolsuper:false,rolcreaterole:true,edges:"1",unsafe_edges:"0",can_set:false,can_use:false}]);
    } finally { await migrated.end(); }
  } finally {
    if (started) execFileSync("pg_ctl",["-D",data,"-m","immediate","-w","stop"],{stdio:"ignore"});
    await rm(directory,{recursive:true,force:true});
  }
});
