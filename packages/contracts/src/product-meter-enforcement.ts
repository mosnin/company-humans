import { z } from "zod";
import { ProductIdSchema } from "./ids.js";
import { MeterDefinitionV1Schema } from "./usage-events.js";
import { LimitWindowSchema } from "./usage-limits.js";

const RequiredScopesSchema = z.array(z.enum(["organization_aggregate", "member"]))
  .length(2)
  .refine(scopes => new Set(scopes).size === 2, "Organization and member scopes are both required");

export const ProductMeterEnforcementV1Schema = z.object({
  meterKey: MeterDefinitionV1Schema.shape.meterKey,
  meterVersion: MeterDefinitionV1Schema.shape.version,
  unit: MeterDefinitionV1Schema.shape.unit,
  aggregation: MeterDefinitionV1Schema.shape.aggregation,
  windows: z.array(LimitWindowSchema).min(1).max(3)
    .refine(windows => new Set(windows).size === windows.length, "Duplicate UTC limit window"),
  requiredScopes: RequiredScopesSchema,
  enforcement: z.literal("hard_stop_before_cost"),
  accounting: z.literal("preserve_accumulated_usage"),
}).strict();

/** Product-owned claim about the complete variable-cost meter surface.
 * Validation proves shape only: no catalog, registered-meter, saved-limit,
 * revision or provider-enforcement comparison occurs here.
 * An empty declaration is valid for a product with no variable-cost meters,
 * but never establishes that the provider actually has none.
 */
export const ProductMeterEnforcementDeclarationV1Schema = z.object({
  schemaVersion: z.literal(1),
  productId: ProductIdSchema,
  // Products begin at access contract revision 0; later access edits advance it.
  accessContractRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  declaredCoverage: z.literal("all_variable_cost_meters"),
  meters: z.array(ProductMeterEnforcementV1Schema).max(2000),
}).strict().superRefine((declaration, ctx) => {
  const keys = new Set<string>();
  declaration.meters.forEach((meter, index) => {
    if (keys.has(meter.meterKey)) {
      ctx.addIssue({ code: "custom", message: "Duplicate variable-cost meter key", path: ["meters", index, "meterKey"] });
    }
    keys.add(meter.meterKey);
  });
});

export type ProductMeterEnforcementDeclarationV1 = z.infer<typeof ProductMeterEnforcementDeclarationV1Schema>;
