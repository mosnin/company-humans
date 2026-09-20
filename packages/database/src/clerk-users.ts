import { createCanonicalId, UserIdSchema, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";

export const ClerkUserChangeSchema = z.object({
  clerkUserId: z.string().regex(/^user_[A-Za-z0-9]+$/),
  primaryEmail: z.email().nullable().transform((value) => value?.toLowerCase() ?? null),
  displayName: z.string().trim().min(1).max(256),
  status: z.enum(["active", "deleted"]),
  eventTimestamp: z.number().int().nonnegative(),
}).strict();
export type ClerkUserChange = z.infer<typeof ClerkUserChangeSchema>;

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

/** Webhook delivery is at least once; provider time and deletion prevent stale resurrection. */
export async function syncClerkUser(databaseUrl: string, change: ClerkUserChange): Promise<UserId> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const input = ClerkUserChangeSchema.parse(change);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await assertIdentityConnection(client);
    const result = await client.query<{ id: string }>(
      `INSERT INTO users (id, clerk_user_id, primary_email, display_name, status, provider_event_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (clerk_user_id) DO UPDATE SET
         primary_email = EXCLUDED.primary_email,
         display_name = EXCLUDED.display_name,
         status = EXCLUDED.status,
         provider_event_timestamp = EXCLUDED.provider_event_timestamp,
         updated_at = now()
       WHERE (EXCLUDED.status = 'deleted' AND EXCLUDED.provider_event_timestamp >= users.provider_event_timestamp)
          OR (users.status = 'active' AND EXCLUDED.status = 'active'
              AND EXCLUDED.provider_event_timestamp >= users.provider_event_timestamp)
       RETURNING id`,
      [createCanonicalId("user"), input.clerkUserId, input.primaryEmail, input.displayName, input.status, input.eventTimestamp],
    );
    if (result.rows[0]) return UserIdSchema.parse(result.rows[0].id);
    const existing = await client.query<{ id: string }>("SELECT id FROM users WHERE clerk_user_id = $1", [input.clerkUserId]);
    if (!existing.rows[0]) throw new Error("Clerk user sync lost its conflict target");
    return UserIdSchema.parse(existing.rows[0].id);
  } finally {
    await client.end();
  }
}

export async function findCanonicalUser(databaseUrl: string, clerkUserId: string): Promise<UserId | null> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!/^user_[A-Za-z0-9]+$/.test(clerkUserId)) throw new Error("Invalid Clerk user ID");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await assertIdentityConnection(client);
    const result = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE clerk_user_id = $1 AND status = 'active'",
      [clerkUserId],
    );
    return result.rows[0] ? UserIdSchema.parse(result.rows[0].id) : null;
  } finally {
    await client.end();
  }
}
