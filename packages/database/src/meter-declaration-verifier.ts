import type { Client } from "pg";
import { ProductCatalogMetadataV1Schema, ProductMeterEnforcementDeclarationV1Schema,
  type ProductMeterEnforcementDeclarationV1 } from "@company-human/contracts";

export type MeterDeclarationIssue = "product_missing" | "product_not_ready" | "catalog_invalid"
  | "catalog_revision_mismatch" | "catalog_meter_set_mismatch" | "registered_meter_mismatch";
export interface MeterDeclarationComparison {
  /** Registry agreement is a narrow local fact, never provider certification. */
  registryCompatible: boolean;
  issues: MeterDeclarationIssue[];
  matchedMeterCount: number;
  declaredMeterCount: number;
  providerEnforcementVerified: false;
  canActivate: false;
}

interface ProductRow { catalog_status: string; catalog_metadata: unknown; access_contract_revision: string; }
interface RegisteredMeter { meter_key: string; version: number; unit: string; aggregation: string; }

/** Caller owns a repeatable-read transaction under the dedicated read-only role. */
export async function compareProductMeterDeclaration(client: Client, input: unknown): Promise<MeterDeclarationComparison> {
  const declaration: ProductMeterEnforcementDeclarationV1 = ProductMeterEnforcementDeclarationV1Schema.parse(input);
  const role = await client.query<{ allowed: boolean }>(`SELECT current_user='company_human_meter_verifier'
    AND current_setting('transaction_isolation')='repeatable read'
    AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AS allowed
    FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`);
  if (role.rows[0]?.allowed !== true) throw new Error("Meter declaration comparison requires a restricted repeatable-read operator");

  const issues = new Set<MeterDeclarationIssue>();
  let matchedMeterCount = 0;
  const result = (): MeterDeclarationComparison => ({ registryCompatible: issues.size === 0, issues: [...issues],
    matchedMeterCount, declaredMeterCount: declaration.meters.length, providerEnforcementVerified: false, canActivate: false });
  const product = (await client.query<ProductRow>(`SELECT catalog_status,catalog_metadata,access_contract_revision
    FROM public.products WHERE id=$1`, [declaration.productId])).rows[0];
  if (!product) { issues.add("product_missing"); return result(); }
  if (product.catalog_status !== "ready") issues.add("product_not_ready");
  if (Number(product.access_contract_revision) !== declaration.accessContractRevision) issues.add("catalog_revision_mismatch");
  const catalog = ProductCatalogMetadataV1Schema.safeParse(product.catalog_metadata);
  if (!catalog.success) issues.add("catalog_invalid");
  else {
    const catalogKeys = catalog.data.usageMeters, declaredKeys = declaration.meters.map(meter => meter.meterKey);
    if (new Set(catalogKeys).size !== catalogKeys.length || catalogKeys.length !== declaredKeys.length
      || catalogKeys.some(key => !declaredKeys.includes(key))) issues.add("catalog_meter_set_mismatch");
  }
  const registered = (await client.query<RegisteredMeter>(`SELECT meter_key,version,unit,aggregation
    FROM public.meter_definitions WHERE product_id=$1 AND meter_key=ANY($2::text[])`,
  [declaration.productId, declaration.meters.map(meter => meter.meterKey)])).rows;
  for (const meter of declaration.meters) {
    if (registered.some(row => row.meter_key === meter.meterKey && row.version === meter.meterVersion
      && row.unit === meter.unit && row.aggregation === meter.aggregation)) matchedMeterCount++;
    else issues.add("registered_meter_mismatch");
  }
  return result();
}
