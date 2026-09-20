# Testing

The scaffold passed `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (one health route test), `npm run build`, and local HTTP checks for `/` and `/api/health` on 2026-09-20 using Node 24. `npm ci` uses the committed `.npmrc` to reproduce the source compatible peer dependency tree. Later phase gates add contract, RLS, adapter, financial, outage, security, and load tests according to the canonical Notion test plan. No end to end product acceptance is claimed by a scaffold build.
