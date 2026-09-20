import { createHash } from "node:crypto";
import { ProductIdSchema, type ProductId } from "@company-human/contracts";
import { Client } from "pg";

export const REFERENCE_PRODUCTS = [
  { key: "company-os", displayName: "Company OS" },
  { key: "scalar", displayName: "Scalar" },
  { key: "operate", displayName: "Operate" },
  { key: "cadre", displayName: "Cadre" },
  { key: "marketer", displayName: "Marketer" },
  { key: "tell-me", displayName: "Tell Me" },
  { key: "stored", displayName: "Stored" },
] as const;

export function referenceProductId(key: string): ProductId {
  const digest = createHash("sha256").update(`company-human:product:v1:${key}`).digest("hex").slice(0, 32);
  return ProductIdSchema.parse(`ch_prod_${digest}`);
}

export async function seedReferenceProducts(databaseUrl: string): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const product of REFERENCE_PRODUCTS) {
      await client.query(
        `INSERT INTO products (id, product_key, display_name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
        [referenceProductId(product.key), product.key, product.displayName],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
