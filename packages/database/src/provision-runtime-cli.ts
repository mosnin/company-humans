import { randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { Client } from "pg";

// Bootstrap a NEW dedicated environment. Refuses existing roles/files; never rotates credentials.
const databaseUrl = process.env.DATABASE_URL;
const outputPath = process.env.RUNTIME_ENV_PATH;
if (!databaseUrl || !outputPath) throw new Error("DATABASE_URL and RUNTIME_ENV_PATH are required");
const output = await open(outputPath, "wx", 0o600);
const client = new Client({ connectionString: databaseUrl });
let committed = false;
let commitAttempted = false;
try {
  await client.connect();
  await client.query("BEGIN");
  const entries: string[] = [];
  for (const [name, grant, variable] of [
    ["ch_web_read", "company_human_app", "DATABASE_RUNTIME_URL"],
    ["ch_web_write", "company_human_service", "DATABASE_SERVICE_URL"],
    ["ch_identity_sync", "company_human_identity", "DATABASE_IDENTITY_URL"],
  ] as const) {
    const password = randomBytes(36).toString("hex");
    await client.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await client.query(`GRANT ${grant} TO ${name}`);
    const connection = new URL(databaseUrl);
    connection.username = name;
    connection.password = password;
    if (process.env.DATABASE_POOL_HOST) connection.hostname = process.env.DATABASE_POOL_HOST;
    connection.searchParams.set("sslmode", "verify-full");
    entries.push(`${variable}=${connection.toString()}`);
  }
  await output.writeFile(entries.join("\n") + "\n");
  await output.sync();
  commitAttempted = true;
  await client.query("COMMIT");
  committed = true;
  console.log("Created separate restricted read, service and identity logins; saved credentials in the requested mode-0600 file.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  // Do not print SQL statements or connection strings; they can include generated credentials.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  throw new Error(`Runtime role bootstrap failed (${code}); no credentials were printed`);
} finally {
  await client.end().catch(() => undefined);
  await output.close();
  // Preserve the secured file if commit acknowledgement was lost; reconcile before retrying.
  if (!committed && !commitAttempted) await unlink(outputPath);
}
