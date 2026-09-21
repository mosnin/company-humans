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
- 9 database integration scenarios: migration/seed idempotency, user synchronization/tombstones, organization identity, RLS, role/team scope, invitation lifecycle, product intent, and restricted write credentials.
- 19 web/backend tests: configuration/authentication boundaries, provider issuer/subject mapping, same-origin profile synchronization, verified-email ownership, session revocation/expiry/owner mismatch, account-linking denial, organization creation, invitation denial, and audited role-policy conflict/actor binding.
- The restricted-role scenario uses actual non-owner database logins. It exercises creation, invitation, teams, grant changes, audit reads, suspension, removal, reinvitation, cross-tenant denial and direct privilege-escalation attempts. It also proves the Phase 00 user/organization/membership/signed-event scenario.
- Sixteen Playwright component tests exercise desktop and 390px mobile interaction. They cover invite links, removal confirmation/denial, team assignment, stale permission edits, role-aware navigation invitation persistence through a simulated sign-in return, OAuth start failures and sign-out failures.
- Package typecheck includes test sources. Production builds exclude those tests from package artifacts.
- All 18 migrations and the seed have run on a fresh local development database. A second dedicated verification database runs the automated tests.

## Evidence boundaries

Browser component tests import the actual components and CSS, but mock authentication, API responses and Next navigation. The harness lives under `apps/web/tests/browser`, outside production routes. Screenshots and traces are ignored under `apps/web/test-results`. These tests do not prove real OAuth, email delivery, remote adapters, merchant payments, or payouts.

The production server has been smoke-tested with authentication unconfigured: public pages/health render and authenticated APIs refuse access. That is a fail-closed configuration check, not successful authentication.

Hosted GitHub Actions run [35522115426](https://github.com/mosnin/company-humans/actions/runs/35522115426) passed on 3fbc494 after the repository became public. Live Convex deployment, provider OAuth sign-in, organization switching and full browser acceptance remain required before Phase 01 is verified. The free Convex team is at its 40-deployment quota. Later phase financial, failure-recovery, adapter and load tests remain unimplemented.

The current authentication code is generated/typechecked locally and tested with `convex-test`; it has not been pushed to a Convex deployment. Normal deployment codegen and a real provider round-trip remain acceptance gates.

## Pending application intent concurrency

`product-instances.integration.test.ts` exercises eight simultaneous enable requests through a restricted PostgreSQL service login. Before the repair the unique organization/product/key constraint rejected concurrent callers. After the repair all callers return one ID, exactly one enable audit event exists, the instance remains pending, a different organization cannot access it, and a conflicting provisioning mode is rejected. This is real database evidence, not a live provider provisioning test.
