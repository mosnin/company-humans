import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { findCanonicalUser, syncAuthUser } from "./auth-users.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("canonical provider user synchronization", () => {
  it("keeps one canonical ID across retries and rejects stale resurrection", async () => {
    const authSubject = `user_Test${crypto.randomUUID().replaceAll("-", "")}`;
    const base = {
      authIssuer: "https://identity.example.test", authSubject,
      primaryEmail: "member@example.test",
      displayName: "Test Member",
      status: "active" as const,
      eventTimestamp: 1000,
    };
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const id = await syncAuthUser(databaseUrl!, base);
      expect(await syncAuthUser(databaseUrl!, base)).toBe(id);
      expect(await findCanonicalUser(databaseUrl!, "https://identity.example.test", authSubject)).toBe(id);
      expect(await syncAuthUser(databaseUrl!, { ...base, displayName: "Updated Member", eventTimestamp: 2000 })).toBe(id);
      expect(await syncAuthUser(databaseUrl!, { ...base, status: "deleted", primaryEmail: null, displayName: "Deleted user", eventTimestamp: 3000 })).toBe(id);
      expect(await findCanonicalUser(databaseUrl!, "https://identity.example.test", authSubject)).toBeNull();
      expect(await syncAuthUser(databaseUrl!, { ...base, eventTimestamp: 2500 })).toBe(id);
      expect(await findCanonicalUser(databaseUrl!, "https://identity.example.test", authSubject)).toBeNull();
      const result = await client.query<{ status: string; provider_event_timestamp: string }>(
        "SELECT status, provider_event_timestamp FROM users WHERE auth_subject = $1",
        [authSubject],
      );
      expect(result.rows).toHaveLength(1);
      const otherIssuerId = await syncAuthUser(databaseUrl!, { ...base, authIssuer: "https://different.example.test" });
      expect(otherIssuerId).not.toBe(id);
      expect(await findCanonicalUser(databaseUrl!, "https://different.example.test", authSubject)).toBe(otherIssuerId);
      expect(result.rows[0]?.status).toBe("deleted");
      expect(Number(result.rows[0]?.provider_event_timestamp)).toBe(3000);
    } finally {
      await client.query("DELETE FROM users WHERE auth_subject = $1", [authSubject]);
      await client.end();
    }
  });
});
