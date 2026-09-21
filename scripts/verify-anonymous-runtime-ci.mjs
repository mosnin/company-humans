import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose';

// Ephemeral GitHub runner only. Never configure a developer or production checkout.
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Requires an ephemeral GitHub Actions runner');
const db = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname));
assert.equal(db.pathname, '/company_human_test');
assert.ok(!process.env.CONVEX_DEPLOY_KEY && !process.env.CONVEX_DEPLOYMENT);
const root = process.cwd(), web = resolve(root, 'apps/web');
const envPath = resolve(web, '.env.local');
await assert.rejects(access(envPath), { code: 'ENOENT' });
const cli = resolve(root, 'node_modules/convex/bin/main.js');
const children = [];
const childEnv = { ...process.env, CONVEX_AGENT_MODE: 'anonymous', AUTH_ENABLED_PROVIDERS: '' };
function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: web, env: childEnv, stdio: ['pipe', 'inherit', 'inherit'], ...options });
  children.push(child);
  return child;
}
function finished(child) {
  return new Promise((resolveResult, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolveResult() : reject(new Error(`Runtime subprocess failed (${code})`)));
  });
}
async function run(command, args, options = {}) {
  const child = start(command, args, options);
  child.stdin.end();
  await finished(child);
}
async function ready(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Runtime stopped before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch { /* still starting */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error('Runtime readiness deadline exceeded');
}
async function setLocal(name, value) {
  const child = start(process.execPath, [cli, 'env', 'set', name], { stdio: ['pipe', 'ignore', 'ignore'] });
  child.stdin.end(value);
  await finished(child);
}
try {
  // Real restricted credentials even though these anonymous tests must never query tenant data.
  const client = new Client({ connectionString: db.href });
  await client.connect();
  const variables = [];
  try {
    await client.query('BEGIN');
    for (const [name, role, variable] of [
      ['ch_ci_read', 'company_human_app', 'DATABASE_RUNTIME_URL'],
      ['ch_ci_write', 'company_human_service', 'DATABASE_SERVICE_URL'],
      ['ch_ci_identity', 'company_human_identity', 'DATABASE_IDENTITY_URL'],
    ]) {
      const password = randomBytes(32).toString('hex');
      await client.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
      await client.query(`GRANT ${role} TO ${name}`);
      const connection = new URL(db); connection.username = name; connection.password = password;
      variables.push(`${variable}=${connection.href}`);
    }
    await writeFile(envPath, `${variables.join('\n')}\nAUTH_ENABLED_PROVIDERS=\n`, { mode: 0o600, flag: 'wx' });
    await client.query('COMMIT');
  } catch { await client.query('ROLLBACK'); throw new Error('Ephemeral runtime credential setup failed'); }
  finally { await client.end(); }
  const convex = start(process.execPath, [cli, 'dev', '--typecheck', 'disable', '--codegen', 'disable']);
  convex.stdin.end();
  await ready('http://127.0.0.1:3210/version', convex);
  // Wait for deployed functions, not just an open backend port.
  const deadline = Date.now() + 120_000;
  let deployed = false;
  while (Date.now() < deadline) {
    const response = await fetch('http://127.0.0.1:3210/api/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'identity:current', args: {}, format: 'json' }), signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (response.ok && result.status === 'success' && result.value === null) { deployed = true; break; }
    if (convex.exitCode !== null) throw new Error('Convex deployment failed');
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  assert.ok(deployed, 'Local identity function deployment deadline exceeded');
  const configured = await readFile(envPath, 'utf8');
  assert.match(configured, /^CONVEX_DEPLOYMENT=anonymous:/m);
  assert.match(configured, /^NEXT_PUBLIC_CONVEX_URL=http:\/\/127\.0\.0\.1:3210$/m);
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  await setLocal('JWT_PRIVATE_KEY', await exportPKCS8(privateKey));
  await setLocal('JWKS', JSON.stringify({ keys: [{ ...await exportJWK(publicKey), use: 'sig', alg: 'RS256' }] }));
  await setLocal('SITE_URL', 'http://127.0.0.1:3000');
  await run('npm', ['run', 'build'], { cwd: root });
  const next = start('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '3000']);
  next.stdin.end();
  await ready('http://127.0.0.1:3000/sign-in', next);
  await run('npm', ['run', 'test:runtime:anonymous']);
} finally {
  for (const child of children.reverse()) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
}
