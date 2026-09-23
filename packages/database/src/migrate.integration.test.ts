import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { runMigrations } from "./migrate.js";
import { REFERENCE_PRODUCTS, referenceProductId, seedReferenceProducts } from "./seed.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("Postgres migration and seed contract", () => {
  it("is idempotent and preserves deterministic product identities", async () => {
    expect(await runMigrations(databaseUrl!)).toEqual([]);
    await seedReferenceProducts(databaseUrl!);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const migrations = await client.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name");
      expect(migrations.rows.map((row) => row.name)).toContain("0001_product_catalog.sql");
      const products = await client.query<{ id: string; product_key: string }>("SELECT id, product_key FROM products WHERE id = ANY($1) ORDER BY product_key", [REFERENCE_PRODUCTS.map((product) => referenceProductId(product.key))]);
      expect(products.rows).toHaveLength(REFERENCE_PRODUCTS.length);
      for (const row of products.rows) expect(row.id).toBe(referenceProductId(row.product_key));
    } finally {
      await client.end();
    }
  });
});
