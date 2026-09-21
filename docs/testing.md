# Testing

Use Node 24 and a dedicated PostgreSQL test database. Never point integration tests at production: they create disposable identities, organizations and login roles, then clean up their own records.

```sh
npm ci
npm run db:migrate
npm run db:seed
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:browser -w @company-human/web
```

Migration, seed and database tests require `DATABASE_URL`. Without it, integration tests skip; a passing skip-only run is not database verification. CI supplies a PostgreSQL service. Test migrations retain applied checksums and use deterministic catalog IDs.

## Current evidence

- 9 shared-contract tests: canonical IDs, versioned envelopes, signatures/tampering, role policy definitions, product metadata and adapter interface shape.
- 11 database integration scenarios: migration/seed idempotency, user synchronization/tombstones, organization identity, RLS, role/team scope, invitation lifecycle, product intent, durable provisioning attempts, restricted dispatcher activation, and restricted write credentials.
- 21 web/backend tests: configuration/authentication boundaries, provider issuer/subject mapping, same-origin profile synchronization, verified-email ownership, session revocation/expiry/owner mismatch, account-linking denial, organization creation, invitation denial, and audited role-policy conflict/actor binding.
- The restricted-role scenario uses actual non-owner database logins. It exercises creation, invitation, teams, grant changes, audit reads, suspension, removal, reinvitation, cross-tenant denial and direct privilege-escalation attempts. It also proves the Phase 00 user/organization/membership/signed-event scenario.
- Twenty Playwright component tests exercise desktop and 390px mobile interaction. They cover invite links, removal confirmation/denial, team assignment, stale permission edits, role-aware navigation invitation persistence through a simulated sign-in return, OAuth start failures and sign-out failures.
- Package typecheck includes test sources. Production builds exclude those tests from package artifacts.
- The first 18 migrations and seed ran on a fresh local development database; migration 0019 has now been applied there and to the verification database. A second dedicated verification database runs the automated tests.

## Evidence boundaries

Browser component tests import the actual components and CSS, but mock authentication, API responses and Next navigation. The harness lives under `apps/web/tests/browser`, outside production routes. Screenshots and traces are ignored under `apps/web/test-results`. These tests do not prove real OAuth, email delivery, remote adapters, merchant payments, or payouts.

The production server has been smoke-tested with authentication unconfigured: public pages/health render and authenticated APIs refuse access. That is a fail-closed configuration check, not successful authentication.

Hosted GitHub Actions run [35522115426](https://github.com/mosnin/company-humans/actions/runs/35522115426) passed on 3fbc494 after the repository became public. The dedicated Convex production backend was deployed at 4b9d614; live anonymous identity denial, discovery and public JWKS passed. Provider OAuth sign-in, organization switching and full browser acceptance remain required before Phase 01 is verified. The separate development deployment still hits the 40-deployment quota. Later phase financial, failure-recovery, adapter and load tests remain unimplemented.

The authentication code is deployed to `sensible-dinosaur-165` and tested with `convex-test`. The provider round-trip remains unverified. Hosted CI also passed at f500dfc in run [35628215810](https://github.com/mosnin/company-humans/actions/runs/35628215810).

## Pending application intent concurrency

`product-instances.integration.test.ts` exercises eight simultaneous enable requests through a restricted PostgreSQL service login. Before the repair the unique organization/product/key constraint rejected concurrent callers. After the repair all callers return one ID, exactly one enable audit event exists, the instance remains pending, a different organization cannot access it, and a conflicting provisioning mode is rejected. This is real database evidence, not a live provider provisioning test.

## Durable provisioning journal — 2026-09-21

All 38 automated tests, typecheck, lint and production build pass locally. The new restricted-service PostgreSQL scenario verifies eight competing claims, stable idempotency keys across worker death, delayed retry, persisted provider job references, expired-lease fencing, immutable finished attempts, tenant read/write denial, permission revocation during a claim, terminal success/permanent failure, retry exhaustion and five consecutive worker crashes. Connected mode creates no new-organization operation. Concurrent enable requests create exactly one pending operation. Migration 0019 ran in both local databases; rerunning the migration runner is covered by the full suite.

Adapter receipts in these tests are explicit fixtures. No provider is contacted, no instance becomes active, and no hosted worker is running. This journal is a CH-15 prerequisite, not completed Scalar or Phase 02 acceptance.

## Restricted dispatcher activation — 2026-09-21

The full suite now has 39 tests and passes with typecheck, lint and production build. The new PostgreSQL scenario runs as actual separate service and provisioner logins. It demonstrates successful fixture activation with one receipt, no repeat provider call after success, registered-product filtering, denial of raw identity/instance writes, denial of general-service activation, rollback after disablement during an external call, revocation during a call, normalized transport failure, refusal of a suspended provider organization, and pending-to-active retry with the same idempotency key. The test fixtures make no network requests and grant no real product access. Migrations 0020–0021 applied to both development and verification databases. Hosted CI for the preceding journal revision ee7bf60 passed in [35629434662](https://github.com/mosnin/company-humans/actions/runs/35629434662).

## Applications diagnostics

Restricted database tests verify authorized operation/attempt projection, cross-user denial and omission of lease tokens and provider references. Two new route tests cover cross-origin enable denial and server-derived actor binding without fabricating an existing instance status. All 41 automated tests pass (full suite followed by the new route cases). Twenty browser component checks pass across desktop and mobile, including failure-history expansion, empty state and hidden contributor navigation. The mobile screenshot shows readable content without horizontal overflow. These browser tests use explicit fixtures, not connected OAuth.
