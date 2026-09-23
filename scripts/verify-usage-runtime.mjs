import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from 'pg';
import { createCanonicalId } from '../packages/contracts/dist/index.js';
import { signEventEnvelope } from '../packages/contracts/dist/signing.js';
import { runMigrations } from '../packages/database/dist/migrate.js';

// A disposable local database and random restricted login; never inserts fixtures
// into the configured database or touches hosted provider credentials.
const source = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname), 'Local PostgreSQL only');
const suffix = randomUUID().replaceAll('-', '');
const database = `ch_usage_runtime_${suffix}`, login = `ch_usage_${suffix}`;
const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
const testUrl = new URL(source); testUrl.pathname = `/${database}`;
const admin = new Client({ connectionString: adminUrl.href });
let createdDatabase = false, createdLogin = false, server;
await admin.connect();
try {
  await admin.query(`CREATE DATABASE ${database}`); createdDatabase = true;
  await runMigrations(testUrl.href);
  const password = randomBytes(32).toString('hex');
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  createdLogin = true;
  await admin.query(`GRANT company_human_usage_ingest TO ${login}`);
  const restricted = new URL(testUrl); restricted.username = login; restricted.password = password;
  const user = createCanonicalId('user'), org = createCanonicalId('organization');
  const product = createCanonicalId('product'), instance = createCanonicalId('productInstance');
  const owner = new Client({ connectionString: testUrl.href }); await owner.connect();
  try {
    await owner.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://runtime.invalid',$1,'Runtime fixture','active',1)", [user]);
    await owner.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,'usage-runtime','Runtime fixture',$2)", [org,user]);
    await owner.query("INSERT INTO products(id,product_key,display_name) VALUES($1,'runtime-usage','Runtime fixture')", [product]);
    await owner.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'main','connected',$4)", [instance,org,product,user]);
    await owner.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'lead',1,'lead','sum','Test leads')", [product]);
  } finally { await owner.end(); }
  const key = randomBytes(32), keyId = 'runtime-test';
  const port = Number(process.env.USAGE_RUNTIME_PORT ?? 3018);
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, DATABASE_USAGE_INGEST_URL: restricted.href,
    USAGE_SIGNING_KEY_RUNTIME: key.toString('hex'),
    USAGE_SIGNING_AUTHORITIES: JSON.stringify([{ keyId, secretEnv:'USAGE_SIGNING_KEY_RUNTIME', organizationId:org,
      productId:product, productInstanceId:instance, sourceSystem:'runtime-test', environment:'test',
      notBefore:new Date(Date.now()-60000).toISOString(), expiresAt:new Date(Date.now()+300000).toISOString(), revoked:false }]),
  };
  server = spawn(process.execPath, ['../../node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],
    { cwd: new URL('../apps/web/',import.meta.url), env, stdio:['ignore','ignore','inherit'] });
  const deadline = Date.now()+30000;
  let ready = false;
  while (Date.now()<deadline) {
    if (server.exitCode !== null) throw new Error('Runtime exited before readiness');
    try { ready = (await fetch(`${base}/api/health`, { signal:AbortSignal.timeout(1000) })).ok; } catch { /* startup */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve,250));
  }
  assert.ok(ready,'Production build startup timed out');
  const body = { schemaVersion:1,eventId:createCanonicalId('event'),organizationId:org,productId:product,eventType:'usage.recorded',
    source:{system:'runtime-test',eventId:'source-1'},actor:{type:'service',id:'runtime-fixture'},environment:'test',
    occurredAt:new Date().toISOString(),reportedAt:new Date().toISOString(),idempotencyKey:'runtime-operation',
    payload:{productInstanceId:instance,membershipId:null,teamId:null,meterKey:'lead',meterVersion:1,quantity:'1.000001',unit:'lead',sourceCost:null,customerRateVersion:null,metadata:{}} };
  const send = input => fetch(`${base}/api/usage/events`, { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(15000) });
  const signed = signEventEnvelope(body,keyId,key);
  const concurrent = await Promise.all([send(signed),send(signed)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,201]);
  for (const response of concurrent) { assert.equal(response.headers.get('cache-control'),'no-store'); assert.equal((await response.json()).eventId,body.eventId); }
  assert.equal((await send(signEventEnvelope({...body,payload:{...body.payload,quantity:'2'}},keyId,key))).status,409);
  assert.equal((await send({...signed,payload:{...body.payload,quantity:'3'}})).status,401);
  const unknown = {...body,eventId:createCanonicalId('event'),idempotencyKey:'runtime-unknown',source:{...body.source,eventId:'source-2'},payload:{...body.payload,meterKey:'unknown'}};
  assert.equal((await send(signEventEnvelope(unknown,keyId,key))).status,202);
  const inspection = new Client({connectionString:testUrl.href}); await inspection.connect();
  try {
    const stored = await inspection.query('SELECT disposition,count(*)::int AS count FROM usage_events GROUP BY disposition ORDER BY disposition');
    assert.deepEqual(stored.rows,[{disposition:'accepted',count:1},{disposition:'quarantined',count:1}]);
  } finally { await inspection.end(); }
  console.log('Verified actual HTTP -> scoped signature -> restricted PostgreSQL: concurrent deduplication, conflict, tamper denial, quarantine. Disposable test environment only.');
} finally {
  if (server && server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await once(server,'exit'); }
  if (createdDatabase) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
  if (createdLogin) await admin.query(`DROP ROLE ${login}`);
  await admin.end();
}
