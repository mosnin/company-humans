import { describe, expect, it } from "vitest";
import { createCanonicalId, CanonicalIdReferenceV1Schema } from "./ids.js";
import { EntitlementRevisionV1Schema, requestedEntitlementEffect } from "./entitlements.js";

describe("desired entitlement configuration", () => {
  it("defaults to denial and preserves an explicit deny across every layer", () => {
    const values = [null, "inherit", "allow", "deny"] as const;
    for (const organization of values) for (const member of values) {
      const expected = organization === "deny" || member === "deny" ? "deny"
        : organization === "allow" || member === "allow" ? "allow" : "deny";
      expect(requestedEntitlementEffect(organization, member)).toBe(expected);
    }
  });
  it("validates typed identity and revision boundaries without implying effective access", () => {
    const entitlementId = createCanonicalId("entitlement");
    expect(CanonicalIdReferenceV1Schema.parse({ schemaVersion: 1, kind: "entitlement", id: entitlementId }).id).toBe(entitlementId);
    const value = { schemaVersion: 1, entitlementId, organizationId: createCanonicalId("organization"),
      productInstanceId: createCanonicalId("productInstance"), membershipId: null,
      capability: "lead-enrichment", revision: 1, effect: "allow" };
    expect(EntitlementRevisionV1Schema.parse(value)).toEqual(value);
    for (const patch of [{revision: 0}, {revision: 1.5}, {revision: 2147483648},
      {capability: "*"}, {effect: "enabled"}, {membershipId: value.organizationId},
      {entitlementId: value.productInstanceId}, {effective: true}]) {
      expect(EntitlementRevisionV1Schema.safeParse({...value, ...patch}).success).toBe(false);
    }
  });
});
