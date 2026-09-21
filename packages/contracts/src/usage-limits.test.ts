import { describe, expect, it } from "vitest";
import { createCanonicalId, CanonicalIdReferenceV1Schema } from "./ids.js";
import { LimitQuantitySchema, UsageLimitRevisionV1Schema } from "./usage-limits.js";
describe("finite usage limit intent", () => {
  it("preserves exact quantities, accepts zero and rejects rounding and unlimited values", () => {
    expect(LimitQuantitySchema.parse("999999999999.999999")).toBe("999999999999.999999");
    expect(LimitQuantitySchema.parse("0.000001")).toBe("0.000001");
    expect(LimitQuantitySchema.parse("12.500000")).toBe("12.5");
    expect(LimitQuantitySchema.parse("0.000000")).toBe("0");
    for (const value of ["-1", "Infinity", "NaN", "unlimited", "1e3", "01", "0.0000001", "1000000000000", " 1", 1, null]) expect(LimitQuantitySchema.safeParse(value).success).toBe(false);
  });
  it("binds a typed limit to a tenant, meter, unit, window and revision", () => {
    const id = createCanonicalId("usageLimit");
    expect(CanonicalIdReferenceV1Schema.parse({ schemaVersion: 1, kind: "usageLimit", id }).id).toBe(id);
    const policy = { schemaVersion: 1, usageLimitId: id, organizationId: createCanonicalId("organization"), productInstanceId: createCanonicalId("productInstance"), membershipId: null, meterKey: "enriched-leads", unit: "lead", window: "utc_month", revision: 1, maximumQuantity: "20" };
    expect(UsageLimitRevisionV1Schema.parse(policy).maximumQuantity).toBe("20");
    for (const change of [{ window: "rolling" }, { revision: 0 }, { membershipId: policy.organizationId }, { unlimited: true }, { unit: "" }]) expect(UsageLimitRevisionV1Schema.safeParse({ ...policy, ...change }).success).toBe(false);
  });
});
