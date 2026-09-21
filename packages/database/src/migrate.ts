import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const migrationDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const migrationPattern = /^\d{4}_[a-z0-9_]+\.sql$/;

export async function runMigrations(databaseUrl: string): Promise<string[]> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const files = (await readdir(migrationDirectory)).filter((name) => migrationPattern.test(name)).sort();
  if (files.length === 0) throw new Error("No SQL migrations found");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('company-human-migrations'))");
    // PostgreSQL 16+ no longer gives CREATEROLE users SET access to roles they create.
    // The migration owner needs SET (not inherited runtime privileges) to transfer
    // narrowly privileged SECURITY DEFINER functions to their dedicated owners.
    const version = await client.query<{ server_version_num: string }>("SHOW server_version_num");
    if (Number(version.rows[0]!.server_version_num) >= 160000) {
      await client.query("SET LOCAL createrole_self_grant = 'set'");
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = await client.query<{ name: string; checksum: string }>("SELECT name, checksum FROM schema_migrations");
    const appliedByName = new Map(applied.rows.map((row) => [row.name, row.checksum]));
    for (const name of appliedByName.keys()) {
      if (!files.includes(name)) throw new Error(`Applied migration ${name} is missing from source`);
    }

    const executed: string[] = [];
    for (const name of files) {
      const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = appliedByName.get(name);
      if (previous) {
        if (previous !== checksum) throw new Error(`Applied migration ${name} has changed`);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
      executed.push(name);
    }
    await client.query("COMMIT");
    return executed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export { migrationDirectory };
