import { describe, expect, it } from "vitest";
import { ProductIdSchema } from "@company-human/contracts";
import { REFERENCE_PRODUCTS, referenceProductId } from "./seed.js";

describe("reference product seed", () => {
  it("uses stable, distinct canonical product IDs", () => {
    const ids = REFERENCE_PRODUCTS.map((product) => referenceProductId(product.key));
    expect(new Set(ids).size).toBe(REFERENCE_PRODUCTS.length);
    for (const id of ids) expect(ProductIdSchema.parse(id)).toBe(id);
    expect(referenceProductId("scalar")).toBe(referenceProductId("scalar"));
  });
});
