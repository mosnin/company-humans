import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { createOrganization, listOrganizationsForUser } from "./organizations.js";
import { syncClerkUser } from "./clerk-users.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("organization and membership isolation", () => {
  it("allows one user in multiple organizations while hiding another user's organization", async () => {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const aliceClerkId = `user_Alice${suffix}`;
    const bobClerkId = `user_Bob${suffix}`;
    const alice = await syncClerkUser(databaseUrl!, { clerkUserId: aliceClerkId, primaryEmail: null, displayName: "Alice", status: "active", eventTimestamp: 1 });
    const bob = await syncClerkUser(databaseUrl!, { clerkUserId: bobClerkId, primaryEmail: null, displayName: "Bob", status: "active", eventTimestamp: 1 });
    const first = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `alice-${suffix}`, name: "Alice One" });
    const second = await createOrganization(databaseUrl!, { ownerUserId: alice, slug: `alice-two-${suffix}`, name: "Alice Two" });
    const other = await createOrganization(databaseUrl!, { ownerUserId: bob, slug: `bob-${suffix}`, name: "Bob One" });
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      expect((await listOrganizationsForUser(databaseUrl!, alice)).map((item) => item.id)).toEqual([first.organizationId, second.organizationId]);
      expect((await listOrganizationsForUser(databaseUrl!, bob)).map((item) => item.id)).toEqual([other.organizationId]);
      const memberships = await client.query<{ organization_id: string; user_id: string }>(
        "SELECT organization_id, user_id FROM memberships WHERE organization_id = ANY($1)",
        [[first.organizationId, second.organizationId, other.organizationId]],
      );
      expect(memberships.rows).toHaveLength(3);
      expect(memberships.rows.filter((row) => row.user_id === alice)).toHaveLength(2);
      expect(memberships.rows.filter((row) => row.user_id === bob)).toHaveLength(1);
    } finally {
      await client.query("DELETE FROM memberships WHERE organization_id = ANY($1)", [[first.organizationId, second.organizationId, other.organizationId]]);
      await client.query("DELETE FROM organizations WHERE id = ANY($1)", [[first.organizationId, second.organizationId, other.organizationId]]);
      await client.query("DELETE FROM users WHERE id = ANY($1)", [[alice, bob]]);
      await client.end();
    }
  });
});
