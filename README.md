# Company Human

Company Human is the human workspace and shared commercial control plane for independently owned ecosystem applications. This repository is `mosnin/company-humans`. Its audited visual foundation comes from `mosnin/company-os-web` at `94827a320e06958995263b32a44d6fc8c227d7a1`. The source repository remains separate.

The npm workspace contains `apps/web`, `packages/contracts`, and `packages/database`. The Next.js app serves the UI and API routes. [Migration assessment](docs/migration-assessment.md), [implementation status](docs/implementation-status.md), and [design foundation](docs/design.md) describe what has been carried over and what is operational.

## Local development

Use Node.js 24. To build without an authenticated session:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

For database integration tests and tenant routes, create a dedicated PostgreSQL database and configure the migration `DATABASE_URL` plus separate restricted `DATABASE_RUNTIME_URL`, `DATABASE_SERVICE_URL`, and `DATABASE_IDENTITY_URL` as described in [.env.example](.env.example). Then run `npm run db:migrate` and `npm run db:seed`. Migrations are append only and checksum checked. The seed creates only the seven draft product catalog records; it creates no tenants.

Convex Auth OAuth configuration is required to exercise live sign-in; see [authentication setup](docs/authentication.md). Product provisioning, usage billing, CRM, attribution, and payouts are unfinished; a pending product instance grants no access. See [implementation status](docs/implementation-status.md) before using the app beyond local development.
