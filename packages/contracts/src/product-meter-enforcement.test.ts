import { describe, expect, it } from "vitest";
import { createCanonicalId } from "./ids.js";
import { ProductMeterEnforcementDeclarationV1Schema } from "./product-meter-enforcement.js";

const meter = () => ({
  meterKey: "enriched-leads", meterVersion: 2, unit: "lead", aggregation: "sum" as const,
  windows: ["utc_day", "utc_month"] as const,
  requiredScopes: ["organization_aggregate", "member"] as const,
  enforcement: "hard_stop_before_cost" as const,
  accounting: "preserve_accumulated_usage" as const,
});
const declaration = () => ({
  schemaVersion: 1 as const, productId: createCanonicalId("product"), accessContractRevision: 7,
  declaredCoverage: "all_variable_cost_meters" as const, meters: [meter()],
});

describe("product variable-cost meter declaration", () => {
  it("pins meter identity, aggregation, finite windows and both enforcement scopes", () => {
    const value = declaration();
    expect(ProductMeterEnforcementDeclarationV1Schema.parse(value)).toEqual(value);
    for (const patch of [
      { meterKey: "Bad Key" }, { meterVersion: 0 }, { meterVersion: 1.5 }, { unit: "" },
      { aggregation: "average" }, { windows: [] }, { windows: ["rolling"] },
      { windows: ["utc_day", "utc_day"] }, { requiredScopes: ["member"] },
      { requiredScopes: ["member", "member"] }, { requiredScopes: ["member", "team"] },
      { enforcement: "hard_stop_after_cost" }, { accounting: "reset_accumulated_usage" },
      { providerVerified: true },
    ]) {
      expect(ProductMeterEnforcementDeclarationV1Schema.safeParse({ ...value, meters: [{ ...meter(), ...patch }] }).success).toBe(false);
    }
    expect(ProductMeterEnforcementDeclarationV1Schema.safeParse({ ...value, meters: [{ ...meter(), requiredScopes: ["member", "organization_aggregate"] }] }).success).toBe(true);
  });

  it("rejects duplicate meter keys even across versions and rejects malformed declarations", () => {
    const value = declaration();
    expect(ProductMeterEnforcementDeclarationV1Schema.safeParse({ ...value, meters: [meter(), { ...meter(), meterVersion: 3 }] }).success).toBe(false);
    for (const patch of [
      { schemaVersion: 2 }, { productId: createCanonicalId("organization") },
      { accessContractRevision: -1 }, { accessContractRevision: 1.5 },
      { declaredCoverage: "some_variable_cost_meters" }, { providerVerified: true },
    ]) expect(ProductMeterEnforcementDeclarationV1Schema.safeParse({ ...value, ...patch }).success).toBe(false);
  });

  it("represents an explicit empty meter set without implying provider verification", () => {
    const empty = { ...declaration(), meters: [] };
    expect(ProductMeterEnforcementDeclarationV1Schema.parse(empty)).toEqual(empty);
    expect(ProductMeterEnforcementDeclarationV1Schema.safeParse({ ...empty, accessContractRevision: 0 }).success).toBe(true);
    expect(ProductMeterEnforcementDeclarationV1Schema.safeParse({ ...empty, providerVerified: true }).success).toBe(false);
    expect(ProductMeterEnforcementDeclarationV1Schema.safeParse({ ...empty, verified: true }).success).toBe(false);
  });
});
