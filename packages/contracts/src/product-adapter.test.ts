import { describe, expect, it } from "vitest";
import { assertProductAdapterV1, PRODUCT_ADAPTER_METHODS } from "./product-adapter.js";

describe("product adapter version 1", () => {
  it("rejects incompatible and incomplete adapters before a product call", () => {
    expect(() => assertProductAdapterV1({ contractVersion: 2 })).toThrow("Unsupported");
    expect(() => assertProductAdapterV1({ contractVersion: 1 })).toThrow("provisionOrganization");
  });

  it("accepts the complete operation surface and rejects a missing lifecycle method", () => {
    const adapter = Object.fromEntries(PRODUCT_ADAPTER_METHODS.map((name) => [name, async () => ({ status: "succeeded" })]));
    expect(new Set(PRODUCT_ADAPTER_METHODS).size).toBe(PRODUCT_ADAPTER_METHODS.length);
    expect(() => assertProductAdapterV1({ contractVersion: 1, ...adapter })).not.toThrow();
    delete adapter.removeMember;
    expect(() => assertProductAdapterV1({ contractVersion: 1, ...adapter })).toThrow("removeMember");
  });
});
