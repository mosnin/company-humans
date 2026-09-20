import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { findCanonicalUser, syncClerkUser } from "./clerk-users.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("canonical Clerk user synchronization", () => {
  it("keeps one canonical ID across retries and rejects stale resurrection", async () => {
    const clerkUserId = `user_Test${crypto.randomUUID().replaceAll("-", "")}`;
    const base = {
      clerkUserId,
      primaryEmail: "member@example.test",
      displayName: "Test Member",
      status: "active" as const,
      eventTimestamp: 1000,
    };
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const id = await syncClerkUser(databaseUrl!, base);
      expect(await syncClerkUser(databaseUrl!, base)).toBe(id);
      expect(await findCanonicalUser(databaseUrl!, clerkUserId)).toBe(id);
      expect(await syncClerkUser(databaseUrl!, { ...base, displayName: "Updated Member", eventTimestamp: 2000 })).toBe(id);
      expect(await syncClerkUser(databaseUrl!, { ...base, status: "deleted", primaryEmail: null, displayName: "Deleted user", eventTimestamp: 3000 })).toBe(id);
      expect(await findCanonicalUser(databaseUrl!, clerkUserId)).toBeNull();
      expect(await syncClerkUser(databaseUrl!, { ...base, eventTimestamp: 2500 })).toBe(id);
      expect(await findCanonicalUser(databaseUrl!, clerkUserId)).toBeNull();
      const result = await client.query<{ status: string; provider_event_timestamp: string }>(
        "SELECT status, provider_event_timestamp FROM users WHERE clerk_user_id = $1",
        [clerkUserId],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.status).toBe("deleted");
      expect(Number(result.rows[0]?.provider_event_timestamp)).toBe(3000);
    } finally {
      await client.query("DELETE FROM users WHERE clerk_user_id = $1", [clerkUserId]);
      await client.end();
    }
  });
});
