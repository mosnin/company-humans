# Web deployment

Dedicated Vercel project `company-humans` (`prj_MHqYyrzlQ0YQxrG8fqAn00doxd5S`) in `mosnins-projects`. Root directory is `apps/web`, framework Next.js, Node 24. Install command is `cd ../.. && npm ci`; build command is `cd ../.. && npm run build`.

Production uses the dedicated Convex cloud URL and three sensitive restricted PostgreSQL variables. The migration-owner URL is not installed in Vercel. Preview environments do not receive production credentials. OAuth providers remain disabled until their dedicated credentials and real callback flows are verified.

`.vercelignore` explicitly excludes all environment files, reference checkouts, caches and generated package output. The first dry run showed that Vercel did not inherit all Git exclusions; no upload occurred until exclusions were added and the complete file manifest was checked. Shared package output is regenerated during the hosted build.

The first staged production build `dpl_DtYyNSrWRG4KzC83TFyWYQ8WQWLS` reached READY on 2026-09-21. It contains application code at `8d72e92` plus the deployment exclusions. Runtime checks and domain promotion are recorded in implementation status; READY alone does not establish authenticated acceptance.
