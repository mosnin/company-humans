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

## Latest recorded evidence

166 automated tests (24 contracts, 21 database, 121 web), typecheck, lint and production build pass for connection orchestration. 62 fixture-backed desktop/mobile browser checks pass for the delivery diagnostics increment. All four configured databases have 35 migrations. See chronological evidence below for scope and limitations.

## Historical foundation evidence

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

## Scoped entitlement administration reads — 2026-09-21

readApplicationEntitlements requires applications.manage and validates the tenant instance and optional member before returning desired settings. It includes supported capabilities plus historical settings, current selected revision, organization/member effects, deny-precedence result and catalog availability. An explicit providerAccessConfirmed=false prevents interpreting this configuration projection as a provider grant. Retired capabilities remain visible for denial/history.

All 92 automated tests, typecheck, lint and build pass. The expanded restricted-role scenario also passes on hosted verification PostgreSQL: organization denial overrides member allow, default/member revision selection is correct, foreign actor/member/instance reads fail, and retired capability settings remain visible but cannot be allowed. No migration or UI changed. Administration screens, actual OAuth and Scalar enforcement remain outstanding. Prior entitlement storage commit 9f4ea3d passed CI 35641383327.

## Entitlement administration UI — 2026-09-21

A dedicated per-application access-settings page edits organization defaults and member overrides through the existing audited endpoint. Applications links to defaults; mapped members link to their own override page using canonical membership identity. Server pages gate applications.manage and report unavailable data without exposing another tenant. Existing Card, Field, Select and Button primitives preserve the scaffold design.

The editor displays saved deny precedence, selected revision, unavailable capabilities and honest empty state. It validates the returned revision and scope, prevents duplicate saves, preserves edits after failures, and requires reload after stale-edit conflicts. Saving does not claim provider access. Real OAuth and Scalar enforcement remain outstanding.

Verified: 92 automated tests, typecheck, lint, build and 40 explicit-fixture desktop/mobile browser checks. Added save/revision reuse, conflict, retry, empty catalog, disabled allow, busy state, malformed receipt and member-allow/organization-deny scenarios. Mobile screenshot inspected; no page overflow. Initial browser failures were an ambiguous text locator and an option-disabled matcher; both corrected to target the intended element/property. No migration required.

The updated member-diagnostics projection also passed its restricted-role regression on hosted verification PostgreSQL. Prior scoped-read commit 8cbf692 passed CI 35641962063.

## Member access request endpoint — 2026-09-21

POST /api/organizations/[organizationId]/applications/[instanceId]/members accepts a canonical membership ID and binds the actor and tenant scope on the server. It rejects missing/foreign Origin and forged extra fields, uses the audited idempotent mapping boundary and returns 202 with providerAccessConfirmed=false. Previously denied mappings require reconciliation (409); unavailable member/product or authorization returns 403; infrastructure details are normalized.

Verified: 109 automated tests (11 contracts, 17 database, 81 web), typecheck, lint and build. Local production-server HTTP rejects missing/foreign Origin and fails closed with Identity unavailable for valid Origin. Authenticated handler cases are explicitly mocked; real OAuth and Scalar provisioning remain unverified. No migration or UI changed. This endpoint records intent; it does not dispatch provisionMember or bypass the documented bootstrap-denial requirement.

## Member access selection UI — 2026-09-21

Admins can open a dedicated member request page from application member diagnostics. A scoped applications.manage query returns active, unmapped members by name, with 50-row pagination and search; it excludes existing mappings so denied access cannot be restored through a fresh request. Unavailable product connections and unauthorized/foreign instances fail closed. The page reuses the inherited table, controls and buttons and states that provisioning/access policies must be confirmed before access.

Verified: 109 automated tests, typecheck, lint, build and 44 explicit-fixture desktop/mobile checks. The expanded restricted-role selection/mapping scenario also passes on hosted verification PostgreSQL. Tests cover scoped results, search, pagination, foreign actors/instances, exclusion after mapping and disabled instance availability. Browser tests verify request/retry, selected member ID, empty eligibility and unconfirmed-access feedback; mobile screenshot inspected without page overflow. Real OAuth, provider lifecycle, effective entitlements and budgets remain unverified. No migration required.

Symbolic native OAuth session expired without callback; its obsolete sign-in tab was closed. OAuth discovery remains available, but authenticated Context/Flow remains unverified. Prior endpoint commit 414b5e3 passed CI 35643239508.

## Suspended member provisioning contract v2 — 2026-09-21

Added a separate version 2 adapter interface requiring explicit suspended creation and a strict suspended success receipt. V1 remains unchanged for existing organization/denial operations and cannot pass V2 registration validation. Normalized incompatibility, typed tenant/member input, bounded retries and strict response schemas are covered. The documented compatibility window and migration sequence precede any worker/provider rollout.

No remote calls, worker, schema migration or access grant are introduced. Scalar must prove initial denial and later entitlement/budget/readback gates before this can establish usable access. The new contract tests do not prove remote enforcement.

Verified for the v2 contract increment: 113 automated tests (15 contracts, 17 database, 81 web), typecheck, lint and production build pass. No UI or database schema changed; no provider test is claimed.

## Suspended member bootstrap verification — 2026-09-21

All 114 automated tests (15 contracts, 18 database, 81 web), typecheck, lint and production build pass. The new restricted-login PostgreSQL scenario covers tenant/product binding, incompatible V1 rejection before claim, concurrent claims, stable retries, invalid active success, transport error normalization, expired leases, retry exhaustion, revocation during execution, inactive identity layers, no provider projection mutation, immutable history and audit rollback/spoof rejection. Only explicit fixture adapters execute. The initial fixture used an invalid user status and then attempted a guarded organization status update; fixture setup was corrected without changing production authorization guards.

No UI changed; browser component checks were not repeated. No real OAuth or Scalar control call is implied by these results.

The bootstrap scenario also passed on the isolated hosted verification database (32.49 seconds). Migration 0030 then applied to local development and hosted production; production replay applied no changes. Both local databases and both hosted databases now have 30 migrations. No production fixture records, execution login or scheduler were created.

## Suspended identity binding verification — 2026-09-21

All 114 automated tests, typecheck, lint and production build pass after extending the bootstrap integration scenario. New assertions cover receipt-required binding, service-role execution denial, worker inability to assume the function owner, direct cross-tenant function denial, suspended projection with immutable attempt provenance, stale repeat rejection, external-identity collision, audit-envelope schema validation and transaction rollback of the projection plus binding audit. Superseded work leaves the external mapping unset. Fixture provider responses remain explicit; no live OAuth or Scalar acceptance is inferred. No UI changed.

The extended restricted-login binding scenario also passed on hosted verification PostgreSQL (36.74 seconds). Migration 0031 then applied to development and production; production replay applied zero changes. All four databases now have 31 migrations. Prior worker commit 293d2d1 passed hosted CI run 35645244935. No provider or production authenticated journey is claimed.

## Finite usage limit verification — 2026-09-21

All 117 automated tests (17 contracts, 19 database, 81 web), typecheck, lint and production build pass. New checks cover exact large/fractional/zero quantities; invalid, negative, infinite, overprecision and unlimited values; concurrent optimistic writes; immutable unit across scopes; current revision checks; tenant/member/role denial; retired/unknown meter behavior; direct SQL numeric constraints; history immutability and audit rollback. The first migration attempt rolled back on a reserved SQL column name; it was corrected before application. No UI or HTTP route changed, and no provider was called.

The restricted-role limit scenario passed on hosted verification PostgreSQL (13.44 seconds). Migration 0032 then applied to development and production, and production replay applied zero changes. All four databases have 32 migrations. Prior binding commit d0817a2 passed CI run 35645973428.

## Usage limit mutation API — 2026-09-21

POST /api/organizations/[organizationId]/applications/[instanceId]/usage-limits now saves finite limit intent through the audited budgets.manage boundary. It derives actor and tenant scope on the server, checks same-origin before identity, rejects forged/unknown fields and preserves exact decimal quantities. Stale revisions return 409; unavailable meters or changed units return 422; tenant/permission denial returns 403; infrastructure failures are normalized. Success returns the saved revision with providerEnforcementConfirmed=false and no-store.

All 157 automated tests (17 contracts, 19 database, 121 web), typecheck, lint and production build pass. Live local HTTP returns 403 for missing/foreign Origin and 503 Identity unavailable for valid Origin under the current local configuration. Authenticated route cases use explicit identity/database fixtures; actual OAuth remains unverified. No migration or UI changed. Scoped read/UI, effective hierarchy, metering and Scalar enforcement remain incomplete. Prior storage commit fc7f09d passed CI run 35646817432.

## Scoped usage limit administration reads — 2026-09-21

readApplicationUsageLimits requires budgets.manage and validates tenant instance/member identity. It returns current exact quantities/revisions for the selected scope, separate organization/member caps, immutable unit metadata, explicit UTC windows and catalog availability. Null is unconfigured, not unlimited. Historical settings remain visible after catalog retirement or metadata loss; nonzero configuration is then unavailable. No effective allowance, remaining balance or provider enforcement is inferred.

All 157 automated tests, typecheck, lint and production build pass. The expanded restricted-role scenario covers current revision selection, exact decimal preservation, unconfigured versus zero, organization/member separation, historical settings, foreign actor/instance/member denial and missing-budget-permission denial. No migration or UI changed. Actual OAuth, provider application, usage aggregation and Scalar enforcement remain outstanding.

The extended usage-limit read/write scenario also passed on hosted verification PostgreSQL (18.64 seconds), using restricted runtime credentials.

## Usage limit administration UI — 2026-09-21

Added a dedicated budgets.manage page for organization and member limits, linked from Applications and member access. It reuses inherited cards/forms, preserves exact decimal input, locks units after first save, displays organization caps separately, and retains historical unavailable meters for zero-only changes. Failed edits remain available for retry; stale or unverified save responses require reload. Empty, restricted and unavailable states are explicit. Saved settings do not confirm provider enforcement.

Verified for this increment: 157 automated tests (17 contracts, 19 database, 121 web), typecheck, lint, production build and 56 desktop/mobile browser component tests. Twelve new browser cases cover exact/zero values, repeat revisions, invalid inputs, immutable units, failures/conflicts, unavailable meters, duplicate submission, malformed receipts, member scope and empty settings. Desktop and mobile screenshots were inspected. Authentication/API browser fixtures remain explicit; real OAuth and Scalar enforcement are still unverified. No migration changed. CH-18 and Phase 02 remain incomplete.

## Exact usage limit adapter extension — 2026-09-21

Added a separately versioned V2 adapter extension for applying and reading back complete finite limit revisions. Strict schemas include canonical scope/revision, bound external organization/member, exact quantity/unit/window, aggregate organization scope, hard-stop mode and preserved accumulated usage. Registration rejects incompatible adapters without invoking them. The readback matcher rejects any changed policy or provider identity; legacy numeric dictionaries cannot satisfy it. Existing V1/V2 operations remain unchanged. Compatibility and migration prerequisites were documented before implementation.

All 164 automated tests (24 contracts, 19 database, 121 web), typecheck, lint and production build pass. Seven new contract tests cover exact values, scope mismatches, idempotency, incompatibility, stale/foreign/reinterpreted readback, counter-reset/weaker-mode denial and normalized failures. No UI or database migration changed; the 56 browser checks remain recorded from 2c2c94c, whose hosted CI 35648547352 passed. No actual adapter transport, durable policy executor, effective resolver, activation or Scalar enforcement is introduced. CH-18 and Phase 02 remain incomplete.

## Durable usage-limit dispatch journal — 2026-09-21

Migration 0033 adds tenant-bound jobs keyed by immutable limit revision, bounded attempt/lease fields and protected attempt provenance/receipts. An invoker-rights trigger queues new revisions atomically with configuration and audit; existing policies enqueue only their latest revision. Web service credentials can enqueue default-pending intent and read authorized records, but cannot claim jobs, change status, fabricate receipts or delete history. No worker login, executor, schedule or provider enforcement is installed.

All 164 automated tests, typecheck, lint and production build pass. The expanded restricted-role scenario proves concurrent saves produce one job, audit failure rolls back queued intent, cross-tenant reads/writes fail, web credentials cannot complete jobs or insert receipts, and completed attempt provenance/receipts cannot change. It also passed on hosted verification PostgreSQL (18.82 seconds). No UI changed; browser results remain the 56 recorded fixture checks. Prior exact-contract commit 09bb893 passed hosted CI 35648942497. Real OAuth, Scalar transport, dispatch/readback and activation remain unfinished; CH-18 is not complete.

The initial write/check attempt failed because the disk was full, before migration creation. Only this repository's generated Next build output was removed; the migration and all checks then succeeded.

Migration 0033 then applied to local development and hosted production; production replay applied no changes. All four databases have 33 migrations. No production fixture records or worker credentials were created.

## Restricted usage-limit application/readback worker — 2026-09-21

Added tenant/product-scoped dispatch under a separate restricted role. Claims use two-minute leases, at most five attempts and a stable policy-revision idempotency key. Unbound provider targets remain pending. Current revision, catalog meter, organization/product state and applicable member identity are checked before dispatch and completion; zero-limit cleanup remains possible after disable. Revision locks serialize completion with policy changes.

The dispatcher validates exact apply receipts, then separately reads provider state. Missing, malformed or mismatched readback cannot succeed. Apply receipts survive readback transport failures; retries preserve their key. Expired leases fail, superseded receipts remain historical, and attempts plus service audit commit atomically. The worker cannot edit policy, identity, product membership or activate access. Successful jobs describe one observed limit, not a complete effective-policy snapshot or an activation grant.

All 165 automated tests (24 contracts, 20 database, 121 web), typecheck, lint and production build pass. The new restricted-role scenario covers concurrent claims, wrong tenant/product, privilege denial, audit rollback, apply/readback mismatch, pending/invalid responses, retry/lease exhaustion, policy supersession, suspended member binding and zero cleanup after disable. Provider calls use explicit fixture adapters. No UI changed; browser evidence remains 56 checks at 2c2c94c. Previous journal commit 9baaa7b passed hosted CI 35649558789. Real Scalar transport, hosted execution credentials/scheduling, full entitlement application/resolution, activation and real OAuth remain unfinished.

The restricted worker scenario also passed on hosted verification PostgreSQL (42.13 seconds). Migration 0034 then applied to local development and hosted production; production replay made no changes. All four databases have 34 migrations. No production fixture records, worker login or scheduler were created.

## Usage-limit delivery diagnostics — 2026-09-21

The budgets.manage read projection now includes current-revision delivery status, bounded attempt history, normalized failures, retry time and recorded timestamps. Organization and member delivery remain separate. Explicit projections exclude provider identities, leases, raw receipts and worker credentials. A newly saved revision cannot inherit an older revision's success.

The existing limit editor shows queued/running/retry/failed/superseded/readback states, a refresh action and expandable attempt history. Readback is described as a past check of one limit, not current access or complete policy enforcement. Saving a new revision clears its previous success display while awaiting refreshed state; failed organization delivery remains visible on member settings.

Verified: all 165 automated tests, typecheck, lint, production build and 62 fixture-backed desktop/mobile browser tests pass. Six new browser cases cover status/history, stale success after save, refresh preserving unsaved input and independent parent/member state. Desktop and mobile screenshots were inspected. Database scenarios verify revision selection, payload exclusion and parent/member separation under restricted credentials. No migration changed; real OAuth/provider acceptance remains incomplete. Prior worker commit 187cb1b passed hosted CI 35650458374.

Both expanded restricted-role scenarios also passed on hosted verification PostgreSQL (62.43 seconds combined test execution). No database migration or production provider call was required.

## Existing product organization connection — 2026-09-21

Added an applications.manage server boundary for an immutable candidate organization on a pending connected instance. It validates catalog support, scopes actor/instance, serializes requests, rejects target changes and records one operation plus audit atomically. The dispatcher now calls connectOrganization for connected intent, preserving create behavior, stable keys, bounded retries and normalized failures. A separate restricted activation function requires the exact requested active organization, live lease, current permission, enabled pending instance and nonretired product. Web credentials cannot invoke it.

All 166 automated tests (24 contracts, 21 database, 121 web), typecheck, lint and production build pass. The new restricted-role scenario covers concurrency, tenant/target validation, atomic audit rollback, pending retry, wrong/inactive provider responses, direct activation mismatch denial and revocation during a provider call. Both connection and existing provisioning regressions passed hosted verification before the final direct-SQL test extension. Prior diagnostics commit 7c8ec54 passed CI 35651117839. No UI changed; 62 browser checks remain recorded from that commit.

This is generic connection orchestration tested with fixture adapters. The real adapter must authenticate the sponsoring organization's connection and verify remote authority before success; a supplied external ID is never proof of ownership. No public connection API/UI or Scalar transport is exposed. The existing organization executor's initiating-human audit model and revoked-call reconciliation still need refinement before hosted operation. CH-16 and Phase 02 are not complete.

Live OAuth recheck confirmed dedicated Convex signing configuration exists but both GitHub/Google credential pairs remain absent. GitHub browser still requires sign-in; the user was asked to sign in while independent work continues. No real authentication or provider access is claimed.

The final connection scenario, including direct SQL target-mismatch denial, passed hosted verification (25.45 seconds). Migration 0035 then applied to local development and hosted production; replay made no changes. All four databases have 35 migrations. No production fixture records or provider connections were created.

## Provisioning receipt retention — 2026-09-21

All 166 automated tests (24 contracts, 21 database, 121 web), typecheck, lint and production build passed on the final receipt-retention code. Extended restricted-role scenarios cover disable, human suspension and catalog retirement during provider calls, retained successful remote receipts without local activation, service actor attribution, rejection of substituted initiating users, and continued claim denial after suspension. Existing stale-lease, tenant, target-mismatch and audit rollback regressions remain in the suite. Provider responses are fixtures; no live Scalar success or remote reconciliation is claimed. No UI changed; browser evidence remains the 62 previously recorded fixture checks.

Both final provisioning/create and existing-connection scenarios passed hosted verification PostgreSQL (49.86 seconds combined test execution). Migration 0036 applied to local development and hosted production; replay reported current. Together with local/hosted verification, all four databases now have 36 migrations. No production fixture records, provider calls or worker credentials were created.

## Direct SQL activation authority — 2026-09-21

A new regression reproduced unauthorized actor substitution: after the original claimant was suspended, a restricted provisioner directly invoked activation under another active administrator's identity and succeeded. Migration 0037 closes this path for both provisionOrganization and connectOrganization. The regression proves the substitute has applications.manage, expects direct SQL denial and no instance binding, then restores the original claimant and verifies legitimate activation. All 167 automated tests (24 contracts, 22 database, 121 web), typecheck, lint and production build pass. No UI or real provider call is involved.

The new direct-SQL authority scenario and both existing provisioning/connection scenarios passed hosted verification PostgreSQL (59.80 seconds combined). Migration 0037 then applied to local development and hosted production. All four databases have 37 migrations. No production fixture records or provider calls were created. Prior commit a2f4f24 passed hosted CI 35653397715.

## Capability staging contracts — 2026-09-21

Six new contract tests cover deny/inherit/default semantics, retired capability exclusion, mixed tenant/member/instance rejection, ambiguous revision snapshots, empty-set revocation, complete replacement and continued suspension, stale/extra/missing capability receipts, target substitutions, incompatible adapters and normalized result states. This is local contract evidence, not provider enforcement or end-to-end activation. No SQL migration, hosted database mutation or UI change is involved.

All 173 automated tests (30 contracts, 22 database, 121 web), typecheck, lint and production build pass. An initial test-source literal typing failure was fixed and typecheck rerun successfully. Prior database activation commit cdbf42f passed CI 35653785919. Database migration count remains 37; browser evidence remains 62 fixture checks from the last UI change.

## Durable capability snapshot preparation — 2026-09-21

All 174 automated tests (30 contracts, 23 database, 121 web), typecheck, lint and production build pass. The new restricted-service PostgreSQL scenario covers five concurrent refreshes producing one revision/audit, unchanged-source deduplication, deny precedence, new source provenance, catalog capability removal, preserved old payloads, foreign actor/tenant denial, RLS-hidden history, runtime mutation denial, direct revision-gap denial, audit rollback and suspended-actor denial. It confirms the product member remains suspended. Provider identities in this scenario are explicit fixtures; no provider transport or activation is exercised. Prior ef1dccd passed CI 35654196568.

The final restricted-service snapshot scenario passed hosted verification PostgreSQL (11.60 seconds). Migration 0038 then applied to local development and hosted production; replay reported current. All four databases have 38 migrations. No production fixture records, worker credentials or provider calls were created.

## Restricted capability staging worker — 2026-09-21

All 175 automated tests (30 contracts, 24 database, 121 web), typecheck, lint and production build pass. The new restricted-worker scenario verifies role/tenant/product denial, five concurrent claims, audit rollback, exact apply/readback mismatch, secret-safe failure normalization, pending results, invalid active-member responses, unchanged provider idempotency across retry, lease expiration and five-attempt exhaustion. It verifies supersession after preference changes without a new snapshot, after a new snapshot, and after instance disable. Completed receipts are immutable; worker access cannot edit snapshots, member grants or private user fields. Service audit is scoped and the member remains suspended. Snapshot preparation regression also remains green after the shared input-reader extraction.

All provider calls are explicit fixture adapters. No live Scalar state, hosted worker login/schedule, real member activation or final effective entitlement gate is claimed. Prior a5b79d4 passed hosted CI 35654732670. No UI changed; browser evidence remains the earlier 62 fixture checks.

Both final capability worker and snapshot preparation scenarios passed hosted verification PostgreSQL (55.31 seconds combined). Migration 0039 then applied to local development and hosted production; replay reported current. All four databases have 39 migrations. No production fixture data, provider calls, worker login or schedule was created.

## Capability delivery administration — 2026-09-21

All 175 automated tests, typecheck, lint and production build pass. Database assertions cover latest-snapshot selection, pending revision without old success/history, current-source mismatch even without a new snapshot, tenant denial, organization-view separation and exclusion of provider identities/leases/raw receipts. The expanded restricted database scenario passed hosted verification PostgreSQL (48.44 seconds). No migration changed.

All 68 desktop/mobile fixture browser checks pass, including six new checks for capability readback/history, stale-source visibility, refresh preserving unsaved edits and clearing previous success after a save. The first run exposed duplicate save-status announcements; the duplicate was removed and the full browser suite rerun. Desktop/mobile screenshots were inspected. Authentication/API data and provider calls remain fixtures; no live OAuth or Scalar acceptance is claimed. Prior dcc85d6 passed CI 35655606157.
