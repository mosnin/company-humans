import { REFERENCE_PRODUCTS, seedReferenceProducts } from "./seed.js";

await seedReferenceProducts(process.env.DATABASE_URL ?? "");
console.log(`Seeded ${REFERENCE_PRODUCTS.length} reference products`);
