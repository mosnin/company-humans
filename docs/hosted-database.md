# Hosted database

Company Human uses dedicated Neon PostgreSQL for its canonical kernel and dedicated Convex for OAuth. Existing ecosystem databases are untouched.

- Project: `twilight-butterfly-74677439` (`company-humans`), free plan, PostgreSQL 17, AWS us-east-1.
- Production branch: `br-fragrant-tooth-aueh6l75`.
- Verification branch: `br-tiny-math-auztnziu`.
- Database: `company_human`; migration owner: `ch_migrator`.
- Compute min/max: 0.25 CU. Provider returned suspend timeout 0; automatic suspension has not been demonstrated.

Use a direct migration connection and pooled runtime connections with `sslmode=verify-full`. Never give the migration connection to the web application.

## Bootstrap a new environment

After migrations, build the database package and run `packages/database/dist/provision-runtime-cli.js` with `DATABASE_URL`, `RUNTIME_ENV_PATH` and optional `DATABASE_POOL_HOST`. The output must be an ignored secret file. This command creates three restricted logins and exclusively creates a mode-0600 credentials file. It refuses existing roles/files and does not rotate credentials. If COMMIT acknowledgement is lost, reconcile role existence using the secured file before retrying.

Use `DATABASE_RUNTIME_URL`, `DATABASE_SERVICE_URL` and `DATABASE_IDENTITY_URL` for the three server connections. No provisioner login is created automatically. Never run the destructive fixture test suite against production; use the isolated verification branch.

## Verified 2026-09-21

All 21 migrations and seven product seeds succeeded on verification and production. Eleven database integration tests passed on verification (two workers, 60-second per-test timeout). Production migration replay was empty. Three pooled restricted logins connected with no elevated role flags, and production contained no users or organizations. Full local 54 tests, typecheck, lint and build passed. This does not prove deployed web access or real OAuth sign-in.
