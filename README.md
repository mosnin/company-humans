# Company Human

Company Human is the human workspace and shared commercial control plane for independently owned ecosystem applications.

This repository is an independent npm workspace with `apps/web`, `apps/api`, `packages/contracts`, `packages/database`, and `packages/testing`. Its visual foundation comes from `mosnin/company-os-web` at `94827a320e06958995263b32a44d6fc8c227d7a1`. Company OS specific routes, data models, authentication, billing, and integrations were not copied. See [migration assessment](docs/migration-assessment.md) and [implementation status](docs/implementation-status.md).

## Local development

Use Node.js 24.

```sh
npm ci
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

The current site is a visual scaffold only. Organization identity, authorization, provisioning, metering, and payouts are not yet active.
