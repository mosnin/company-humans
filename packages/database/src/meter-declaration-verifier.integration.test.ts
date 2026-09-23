import { Client } from "pg";
import { expect, it } from "vitest";
import { createCanonicalId } from "@company-human/contracts";
import { compareProductMeterDeclaration } from "./meter-declaration-verifier.js";

const url = process.env.DATABASE_URL;
it.skipIf(!url)("compares claimed meters with a current catalog and registered definitions without certifying a provider", async () => {
  const client = new Client({ connectionString: url }); await client.connect();
  const productId = createCanonicalId("product");
  const metadata = { schemaVersion: 1, description: "Meter fixture", category: "sales",
    supportedCapabilities: [], provisioningModes: ["connected"], supportedMemberOperations: ["provision"],
    usageMeters: ["enriched-leads"], requiredPermissions: ["product.use"], adapterVersion: "1.0.0",
    billingBehavior: "organization_sponsored", deepLinks: {}, connectionRequirements: [] };
  const declaration = { schemaVersion: 1, productId, accessContractRevision: 0,
    declaredCoverage: "all_variable_cost_meters", meters: [{ meterKey: "enriched-leads", meterVersion: 3,
      unit: "lead", aggregation: "sum", windows: ["utc_month"], requiredScopes: ["organization_aggregate", "member"],
      enforcement: "hard_stop_before_cost", accounting: "preserve_accumulated_usage" }] };
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await client.query(`INSERT INTO public.products(id,product_key,display_name,catalog_status,catalog_metadata)
      VALUES($1,$2,'Meter fixture','ready',$3)`, [productId, `meter-${crypto.randomUUID()}`, metadata]);
    await client.query(`INSERT INTO public.meter_definitions(product_id,meter_key,version,unit,aggregation,display_name)
      VALUES($1,'enriched-leads',3,'lead','sum','Enriched leads')`, [productId]);
    await expect(compareProductMeterDeclaration(client, declaration)).rejects.toThrow("restricted repeatable-read operator");
    await client.query("SET LOCAL ROLE company_human_meter_verifier");
    const privileges = await client.query<{ writes: boolean }>(`SELECT
      has_table_privilege(current_user,'public.products','UPDATE')
      OR has_table_privilege(current_user,'public.meter_definitions','INSERT') AS writes`);
    expect(privileges.rows[0]?.writes).toBe(false);
    expect(await compareProductMeterDeclaration(client, declaration)).toEqual({ registryCompatible: true,
      issues: [], matchedMeterCount: 1, declaredMeterCount: 1, providerEnforcementVerified: false, canActivate: false });
    expect((await compareProductMeterDeclaration(client, { ...declaration, accessContractRevision: 1 })).issues)
      .toContain("catalog_revision_mismatch");
    for (const patch of [{ meterVersion: 2 }, { unit: "credit" }, { aggregation: "maximum" }]) {
      expect((await compareProductMeterDeclaration(client, { ...declaration,
        meters: [{ ...declaration.meters[0], ...patch }] })).issues).toContain("registered_meter_mismatch");
    }
    const extra = await compareProductMeterDeclaration(client, { ...declaration,
      meters: [...declaration.meters, { ...declaration.meters[0], meterKey: "other-meter" }] });
    expect(extra.issues).toEqual(expect.arrayContaining(["catalog_meter_set_mismatch", "registered_meter_mismatch"]));
    expect((await compareProductMeterDeclaration(client, { ...declaration, productId: createCanonicalId("product") })).issues)
      .toContain("product_missing");
    await client.query("RESET ROLE");
    await client.query("UPDATE public.products SET catalog_metadata=$2 WHERE id=$1", [productId, { ...metadata, usageMeters: [] }]);
    const revision = (await client.query<{ access_contract_revision: string }>(
      "SELECT access_contract_revision FROM public.products WHERE id=$1", [productId])).rows[0]!.access_contract_revision;
    await client.query("SET LOCAL ROLE company_human_meter_verifier");
    expect((await compareProductMeterDeclaration(client, declaration)).issues)
      .toEqual(expect.arrayContaining(["catalog_revision_mismatch", "catalog_meter_set_mismatch"]));
    const empty = await compareProductMeterDeclaration(client, { ...declaration,
      accessContractRevision: Number(revision), meters: [] });
    expect(empty).toEqual({ registryCompatible: true, issues: [], matchedMeterCount: 0,
      declaredMeterCount: 0, providerEnforcementVerified: false, canActivate: false });
    await client.query("RESET ROLE");
    await client.query("UPDATE public.products SET catalog_metadata=$2 WHERE id=$1", [productId,
      { ...metadata, usageMeters: ["enriched-leads", "enriched-leads"] }]);
    await client.query("SET LOCAL ROLE company_human_meter_verifier");
    expect((await compareProductMeterDeclaration(client, declaration)).issues).toContain("catalog_meter_set_mismatch");
    await client.query("RESET ROLE");
    await client.query("UPDATE public.products SET catalog_metadata=NULL WHERE id=$1", [productId]);
    await client.query("SET LOCAL ROLE company_human_meter_verifier");
    expect((await compareProductMeterDeclaration(client, declaration)).issues).toContain("catalog_invalid");
    await client.query("RESET ROLE");
    await client.query("UPDATE public.products SET catalog_status='draft' WHERE id=$1", [productId]);
    await client.query("SET LOCAL ROLE company_human_meter_verifier");
    expect((await compareProductMeterDeclaration(client, emptyDeclaration(declaration, Number(revision) + 1))).issues)
      .toContain("product_not_ready");
    await client.query("RESET ROLE");
    await client.query("ROLLBACK");
    await expect(compareProductMeterDeclaration(client, declaration)).rejects.toThrow("restricted repeatable-read operator");
  } finally { await client.query("ROLLBACK").catch(() => undefined); await client.end(); }
});

function emptyDeclaration(base: { schemaVersion: number; productId: string; declaredCoverage: string }, revision: number) {
  return { ...base, accessContractRevision: revision, meters: [] };
}
