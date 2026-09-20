import { describe, expect, it } from "vitest";
import { ProductCatalogMetadataV1Schema } from "./app-catalog.js";

describe("product catalog metadata", () => {
  it("requires an explicit version and provisioning mode", () => {
    const metadata = {
      schemaVersion: 1, description: "Outbound and enrichment", category: "sales",
      supportedCapabilities: ["lead-enrichment"], provisioningModes: ["provisioned"],
      supportedMemberOperations: ["provision", "suspend"], usageMeters: ["enriched-leads"],
      requiredPermissions: ["product.use"], adapterVersion: "1.0.0",
      billingBehavior: "organization_sponsored", deepLinks: {}, connectionRequirements: ["service-credential"],
    };
    expect(ProductCatalogMetadataV1Schema.parse(metadata)).toEqual(metadata);
    expect(ProductCatalogMetadataV1Schema.safeParse({ ...metadata, provisioningModes: [] }).success).toBe(false);
    expect(ProductCatalogMetadataV1Schema.safeParse({ ...metadata, schemaVersion: 2 }).success).toBe(false);
  });
});
