import { describe, expect, it } from "vitest";
import { BudgetIdSchema, CanonicalIdReferenceV1Schema, createCanonicalId, HumanAssignmentIdSchema, HumanCompletionIdSchema, ID_SCHEMA_VERSION, MembershipIdSchema, OrganizationIdSchema, UserIdSchema, UsageLimitIdSchema } from "./ids.js";

describe("canonical IDs v1", () => {
  it("creates globally distinct typed IDs", () => {
    const user = createCanonicalId("user");
    const anotherUser = createCanonicalId("user");
    expect(UserIdSchema.parse(user)).toBe(user);
    expect(user).not.toBe(anotherUser);
    expect(OrganizationIdSchema.safeParse(user).success).toBe(false);
    expect(MembershipIdSchema.safeParse(user).success).toBe(false);
  });

  it("rejects wrong kinds and unsupported schema versions at the boundary", () => {
    const mapping = createCanonicalId("productMembership");
    expect(CanonicalIdReferenceV1Schema.parse({ schemaVersion: 1, kind: "productMembership", id: mapping }).id).toBe(mapping);
    expect(MembershipIdSchema.safeParse(mapping).success).toBe(false);
    const organization = createCanonicalId("organization");
    expect(CanonicalIdReferenceV1Schema.parse({ schemaVersion: ID_SCHEMA_VERSION, kind: "organization", id: organization }).id).toBe(organization);
    expect(CanonicalIdReferenceV1Schema.safeParse({ schemaVersion: 2, kind: "organization", id: organization }).success).toBe(false);
    expect(CanonicalIdReferenceV1Schema.safeParse({ schemaVersion: 1, kind: "user", id: organization }).success).toBe(false);
    expect(CanonicalIdReferenceV1Schema.safeParse({ schemaVersion: 1, kind: "organization", id: "convex_provider_id" }).success).toBe(false);
    const budget = createCanonicalId("budget");
    expect(BudgetIdSchema.parse(budget)).toBe(budget);
    expect(UsageLimitIdSchema.safeParse(budget).success).toBe(false);
    expect(CanonicalIdReferenceV1Schema.parse({ schemaVersion: 1, kind: "budget", id: budget }).id).toBe(budget);
  });

  it("keeps a human obligation distinct from a completion report", () => {
    const assignment = createCanonicalId("humanAssignment");
    const completion = createCanonicalId("humanCompletion");
    expect(HumanAssignmentIdSchema.parse(assignment)).toBe(assignment);
    expect(HumanCompletionIdSchema.parse(completion)).toBe(completion);
    expect(HumanCompletionIdSchema.safeParse(assignment).success).toBe(false);
    expect(CanonicalIdReferenceV1Schema.parse({ schemaVersion: 1, kind: "humanAssignment", id: assignment }).id).toBe(assignment);
    expect(CanonicalIdReferenceV1Schema.parse({ schemaVersion: 1, kind: "humanCompletion", id: completion }).id).toBe(completion);
  });
});
