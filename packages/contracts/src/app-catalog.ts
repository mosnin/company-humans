import { z } from "zod";

const Slug = z.string().regex(/^[a-z][a-z0-9._-]*$/);

export const ProvisioningModeSchema = z.enum(["provisioned", "connected", "external_only", "native_module"]);
export const ProductCatalogMetadataV1Schema = z.object({
  schemaVersion: z.literal(1),
  description: z.string().trim().min(1).max(2000),
  category: Slug,
  iconUrl: z.url().optional(),
  supportedCapabilities: z.array(Slug),
  provisioningModes: z.array(ProvisioningModeSchema).min(1),
  supportedMemberOperations: z.array(Slug),
  usageMeters: z.array(Slug),
  requiredPermissions: z.array(Slug),
  healthEndpoint: z.url().optional(),
  adapterVersion: z.string().min(1).max(64),
  billingBehavior: z.enum(["organization_sponsored", "external_merchant", "native"]),
  deepLinks: z.record(Slug, z.url()),
  connectionRequirements: z.array(Slug),
}).strict();
export type ProductCatalogMetadataV1 = z.infer<typeof ProductCatalogMetadataV1Schema>;
