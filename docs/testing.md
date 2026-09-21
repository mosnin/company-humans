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
- 14 database integration scenarios: migration/seed idempotency, user synchronization/tombstones, organization identity, RLS, role/team scope, invitation lifecycle, product intent, durable provisioning attempts, restricted dispatcher activation, and restricted write credentials.
- 35 web/backend tests: configuration/authentication boundaries, provider issuer/subject mapping, same-origin profile synchronization, verified-email ownership, session revocation/expiry/owner mismatch, account-linking denial, organization creation, invitation denial, and audited role-policy conflict/actor binding.
- The restricted-role scenario uses actual non-owner database logins. It exercises creation, invitation, teams, grant changes, audit reads, suspension, removal, reinvitation, cross-tenant denial and direct privilege-escalation attempts. It also proves the Phase 00 user/organization/membership/signed-event scenario.
- Twenty-two Playwright component tests exercise desktop and 390px mobile interaction. They cover invite links, removal confirmation/denial, team assignment, stale permission edits, role-aware navigation invitation persistence through a simulated sign-in return, OAuth start failures and sign-out failures.
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

## Browser mutation request origin

54 automated tests pass: 9 contracts, 11 PostgreSQL scenarios and 34 web/backend cases. The twelve mutation-handler cases cover absent/null origin, foreign host, deceptive host suffix, protocol and port changes, plus normal same-origin authentication. A separate case covers Next proxy hostname normalization and rejects forwarded-host overrides. Existing positive mutation tests now explicitly supply the browser's Origin header. Typecheck, lint and production build pass.

The production build was started on loopback port 3215 and all twelve handlers were exercised via real HTTP. Missing/foreign origins returned 403; valid local origin reached authentication and returned 503 because OAuth is unconfigured. Public health returned 200. The first runtime run caught the internal-hostname mismatch; the corrected guard passed all checks. The server was stopped after verification. [The receipt binds the checked source hashes](execution/origin-runtime-evidence.json). This does not prove real login or authenticated end-to-end mutations.

## Invitation revocation

The restricted-login integration scenario proves contributor/cross-tenant denial, token-free listing projection, duplicate revocation with one audit event, revoked-token rejection, accepted-invitation immutability and a concurrent accept/revoke race with exactly one winner. It passes both locally and on the dedicated hosted verification branch. The new DELETE route is covered by the origin-denial suite. Desktop/mobile component tests prove confirmation, error recovery, and immediate status update after revocation; OAuth/API responses remain mocked there. Full 56 automated tests, 22 browser component checks, typecheck, lint and production build pass.

## Product membership mapping

57 automated tests pass. The new restricted-login scenario verifies six concurrent mapping requests yield one canonical ID/audit record, inactive-instance denial, cross-tenant actor/foreign-key denial, read isolation, denial of forged provider fields and activation, denied deletion, and denial of automatic re-enable after disablement. It passes on both local and hosted verification PostgreSQL. The connected product instance is an explicit test fixture; no Scalar member was created. Migration 0022 was then applied to production. Typecheck, lint and build pass.

## Member offboarding commands

The new restricted-role scenario covers a member administrator without applications.manage, contributor denial, atomic denial plus revisioned commands, preservation of actual provider state, no restoration on resume/reinvite, immutable command history, rollback after command insertion failure, and concurrent mapping versus suspension. A deterministic database race observes an INSERT waiting on the parent transition lock, then verifies rejection after suspension commits. The new scenario and prior mapping scenario also pass on hosted verification PostgreSQL. Full suite is 58 tests; typecheck, lint and production build pass. No external product was contacted.

A broader suite run reproduced a membership-row/advisory-lock deadlock. The corrected service acquires the advisory lock first; ten consecutive focused race runs, the full suite and the hosted scenario passed after that repair.

## Product disable boundary

59 automated tests, typecheck, lint and production build pass. The new restricted-credential database scenario passes locally and on hosted verification PostgreSQL: foreign actor/tenant denial, rollback when suspension-command insertion fails, six concurrent idempotent disables, unchanged provider state, blocked unreconciled re-enable, runtime provider-field protection, insertion-versus-disable race, and deterministic blocked INSERT followed by denial. No UI changed and no provider was contacted. Migrations 0025–0026 were applied to local development and hosted production only after the verification scenario passed.

## Applications disable UI/API

68 automated tests, typecheck, lint, production build and 24 desktop/mobile component checks pass. New route tests cover server actor binding, body spoofing, unauthenticated/forbidden/unavailable identity, invalid IDs, permission failures and sanitized infrastructure errors. The mutation suite includes missing/foreign-origin rejection for the new route. Browser fixtures cover confirmation/cancel, failure retry, disabled in-flight controls, updated desired-state display and explicit unconfirmed remote access. Mobile screenshot inspected; no horizontal overflow.

Real local Next production-server requests reject missing/foreign origins with 403. A valid origin reaches the identity boundary and returns 503 Identity unavailable in the unconfigured local auth environment; this is not authenticated acceptance. The first runtime assertion expected 401, then the response body and identity resolver confirmed the configuration-dependent 503. Prior database increment f834c37 passed hosted CI run 35637451563.

## Restricted member denial dispatcher

69 automated tests, typecheck, lint and build pass. The new scenario also passes on hosted verification PostgreSQL using separate service and worker logins. It tests wrong-role/owner rejection, tenant/product isolation, six concurrent claims, stable retry keys, pending delay, stale lease rejection, cleanup after initiating-member suspension, denied mapping mutation/history deletion, completed-attempt immutability, sanitized transport failure, invalid active success, mismatched external member, superseded suspension followed by removal, and five-attempt crash/retry exhaustion. Explicit fixture adapters are used; no provider acceptance is claimed. No UI changed.

## Application member diagnostics

69 automated tests, typecheck, lint and build pass; 28 desktop/mobile component checks pass. The existing denial integration scenario now verifies queued/provider-reported states, capability denial after membership suspension, foreign-instance denial, pagination and absence of lease/provider/worker identifiers in the projection. It also passes on hosted verification PostgreSQL. Browser fixtures verify queued, failed, completed and empty states, expandable attempts and bounded mobile table scrolling. Mobile screenshot inspected. Authentication and provider responses remain fixtures in browser checks.

## Service actor audit

All 69 automated tests, typecheck, lint and production build pass. The extended denial-worker scenario also passes on hosted verification PostgreSQL. It verifies one audit claim across concurrent claimers, service envelope/row agreement, visible service attribution, denial of forged human/other-service actors, no audit deletion, and transaction rollback when a deliberately injected audit failure interrupts receipt completion. The fixture trigger is removed in a finally block. Audit payloads exclude lease tokens. This is database execution evidence, not real OAuth or provider acceptance.

## Entitlement intent verification — 2026-09-21

All 72 automated tests, typecheck, lint and build pass. Entitlement tests exercise every allow/deny/inherit/default combination, typed revision boundaries, five concurrent writes with one winner, stale expected revision, organization/member scoping, foreign tenant reads/writes, composite foreign keys, unsupported/retired/missing metadata, consecutive revisions, UPDATE/DELETE denial and transaction rollback on injected audit failure. The database scenario also passed on isolated hosted verification PostgreSQL. Test catalog entries are unique fixtures, not live Scalar capabilities; the reference-seed test now checks the seven deterministic reference products without assuming the extensible catalog contains only those rows.

## Entitlement mutation API — 2026-09-21

POST /api/organizations/[organizationId]/applications/[instanceId]/entitlements binds the authenticated actor and URL scope, rejects unknown body fields and foreign/missing Origin, and calls the audited applications.manage boundary. Stale revisions return 409; unavailable capabilities return 422; tenant/permission denial returns 403; infrastructure errors are normalized. Success returns the saved revision with providerAccessConfirmed=false and no-store.

All 92 automated tests, typecheck, lint and production build pass. Local production-server HTTP checks return 403 for missing/foreign Origin and 503 Identity unavailable for valid Origin with the current unconfigured local identity. Authenticated handler tests use explicit identity/database mocks; actual OAuth remains unverified. No UI, effective authorization, provider grant or usage enforcement is added by this endpoint. After verification, generated .next output was removed to recover disk space; source and evidence were preserved.
