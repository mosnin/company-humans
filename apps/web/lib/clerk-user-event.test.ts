import { describe, expect, it } from "vitest";
import { normalizeClerkUserEvent } from "./clerk-user-event";

const data = {
  id: "user_ABC123",
  first_name: "Ada",
  last_name: "Lovelace",
  primary_email_address_id: "idn_1",
  email_addresses: [{ id: "idn_1", email_address: "ada@example.test" }],
  private_metadata: { secret: "must-not-sync" },
};

describe("Clerk webhook normalization", () => {
  it("copies only canonical profile fields", () => {
    expect(normalizeClerkUserEvent({ type: "user.created", timestamp: 1000, data })).toEqual({
      clerkUserId: "user_ABC123",
      primaryEmail: "ada@example.test",
      displayName: "Ada Lovelace",
      status: "active",
      eventTimestamp: 1000,
    });
  });

  it("tombstones deleted users without retaining profile data", () => {
    expect(normalizeClerkUserEvent({ type: "user.deleted", timestamp: 2000, data: { id: data.id } })).toEqual({
      clerkUserId: "user_ABC123",
      primaryEmail: null,
      displayName: "Deleted user",
      status: "deleted",
      eventTimestamp: 2000,
    });
  });
});
