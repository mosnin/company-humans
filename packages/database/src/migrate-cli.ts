import { runMigrations } from "./migrate.js";

const executed = await runMigrations(process.env.DATABASE_URL ?? "");
console.log(executed.length ? `Applied migrations: ${executed.join(", ")}` : "Migrations already current");
