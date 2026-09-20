import { createCanonicalId, UserIdSchema, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";

export const AuthUserChangeSchema = z.object({
  authIssuer: z.url(),
  authSubject: z.string().min(1).max(256),
  primaryEmail: z.email().nullable().transform((value) => value?.toLowerCase() ?? null),
  displayName: z.string().trim().min(1).max(256),
  status: z.enum(["active", "deleted"]),
  eventTimestamp: z.number().int().nonnegative(),
}).strict();
export type AuthUserChange = z.infer<typeof AuthUserChangeSchema>;

async function assertIdentityConnection(client: Client): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const result = await client.query<{ allowed: boolean }>(
    `SELECT pg_has_role(current_user, 'company_human_identity', 'member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND (SELECT NOT pg_has_role(current_user, c.relowner, 'member') FROM pg_class AS c WHERE c.oid = 'public.users'::regclass) AS allowed
     FROM pg_roles AS r WHERE r.rolname = current_user`,
  );
  if (!result.rows[0]?.allowed) throw new Error("Identity synchronization requires a restricted identity role");
}

/** Repeated profile sync preserves canonical identity; provider time and deletion prevent stale resurrection. */
export async function syncAuthUser(databaseUrl: string, change: AuthUserChange): Promise<UserId> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const input = AuthUserChangeSchema.parse(change);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await assertIdentityConnection(client);
    const result = await client.query<{ id: string }>(
      `INSERT INTO users (id, auth_subject, primary_email, display_name, status, provider_event_timestamp, auth_issuer)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (auth_issuer, auth_subject) DO UPDATE SET
         primary_email = EXCLUDED.primary_email,
         display_name = EXCLUDED.display_name,
         status = EXCLUDED.status,
         provider_event_timestamp = EXCLUDED.provider_event_timestamp,
         updated_at = now()
       WHERE (EXCLUDED.status = 'deleted' AND EXCLUDED.provider_event_timestamp >= users.provider_event_timestamp)
          OR (users.status = 'active' AND EXCLUDED.status = 'active'
              AND EXCLUDED.provider_event_timestamp >= users.provider_event_timestamp)
       RETURNING id`,
      [createCanonicalId("user"), input.authSubject, input.primaryEmail, input.displayName, input.status, input.eventTimestamp, input.authIssuer],
    );
    if (result.rows[0]) return UserIdSchema.parse(result.rows[0].id);
    const existing = await client.query<{ id: string }>("SELECT id FROM users WHERE auth_subject = $1 AND auth_issuer = $2", [input.authSubject, input.authIssuer]);
    if (!existing.rows[0]) throw new Error("Auth user sync lost its conflict target");
    return UserIdSchema.parse(existing.rows[0].id);
  } finally {
    await client.end();
  }
}

export async function findCanonicalUser(databaseUrl: string, authIssuer: string, authSubject: string): Promise<UserId | null> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  z.url().parse(authIssuer);
  z.string().min(1).max(256).parse(authSubject);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await assertIdentityConnection(client);
    const result = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE auth_subject = $1 AND auth_issuer = $2 AND status = 'active'",
      [authSubject, authIssuer],
    );
    return result.rows[0] ? UserIdSchema.parse(result.rows[0].id) : null;
  } finally {
    await client.end();
  }
}
