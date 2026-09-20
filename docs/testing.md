# Testing

The scaffold passed `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (one health route test), `npm run build`, and local HTTP checks for `/` and `/api/health` on 2026-09-20 using Node 24. `npm ci` uses the committed `.npmrc` to reproduce the source compatible peer dependency tree. Later phase gates add contract, RLS, adapter, financial, outage, security, and load tests according to the canonical Notion test plan. No end to end product acceptance is claimed by a scaffold build.

The monorepo structure passes local package typecheck, lint, tests, and build. Hosted GitHub CI has not run because destination repository identity is unresolved.

A fresh local Postgres 18 database accepted migration `0001_product_catalog.sql` and seven reference products. Repeating migration and seed made no additional migration or product rows. CI now has a Postgres service and runs this database contract test, but hosted execution is not yet observed.

Five contract tests now cover typed IDs, schema version rejection, event/audit signing, tamper detection, wrong key rejection, and tenant ID type rejection. These validate contracts only; they do not prove ingestion authorization or durable audit storage.

Local Postgres tests prove duplicate Clerk events preserve one canonical user ID, newer updates apply, deletion hides the user, and an older update cannot revive the tombstone. Webhook route tests cover missing configuration and failed signature verification. A live Clerk callback is still required for task 6 acceptance.

The production build also served `/` and `/api/health` successfully with Clerk unconfigured. `/api/me` and the webhook returned 503, as intended, rather than creating unauthenticated identity state. This is a configuration boundary, not a successful Clerk integration test.
