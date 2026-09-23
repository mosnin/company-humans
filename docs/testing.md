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

At committed fe45da6, 338 automated tests (70 contracts, 34 database, 234 web), typecheck, lint and production build passed locally. CI run35751516447 passed at the same revision. Hosted verification and production contain migrations through0050. Subsequent uncommitted work must pass its own checks. See implementation-status.md and chronological evidence below for scope and limitations.

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

## Bounded background capability refresh — 2026-09-21

All 176 automated tests (30 contracts, 25 database, 121 web), typecheck, lint and production build pass. The new restricted-preparer scenario verifies one-member keyset pages, maximum batch validation, tenant/product and credential denial, concurrent deduplication, changed preferences/catalog, background preparation after the policy administrator is suspended, ineligible-member skipping, snapshot/job/audit rollback and truthful service provenance. It checks denial of policy/access/job-result edits and private user reads. Existing human snapshot insertion remains covered. Prior e32be47 passed CI 35656334045. No UI changed; 68 browser fixture checks remain recorded from that commit.

Both background and human snapshot preparation scenarios passed hosted verification PostgreSQL (29.14 seconds combined). Migration 0040 then applied to local development and hosted production; replay reported current. All four databases have 40 migrations. No production fixture records, execution credentials or scheduled jobs were created.

## Existing organization connection request — 2026-09-21

Applications administration now exposes the existing connected-instance intent service for enabled, pending connected instances without an operation. The form records an external organization ID, explains required provider authorization/ownership verification, locks the submitted target, preserves input on errors and reports provider verification as pending. It does not create a provider connection, verify ownership or grant product access.

The new POST connection endpoint derives actor identity from authentication, enforces same origin, validates canonical URL scope and a strict bounded request body, uses the existing applications.manage/RLS service, returns 202 with providerConnectionConfirmed=false and no-store, and normalizes denial/conflict/infrastructure errors without private details. Existing service idempotency and immutable target semantics remain unchanged.

Verified: 195 automated tests (30 contracts, 25 database, 140 web), typecheck, lint and production build; 72 desktop/mobile browser fixture checks, including pending connection and conflict handling. Both rendered screenshots were inspected. The initial combined database/browser run timed out one existing 5-second database scenario; the full suite rerun without competing browser load passed, without weakening test timeouts. Built-server HTTP checks rejected missing/foreign origin with 403; same-origin reached the identity boundary and returned 503 Identity unavailable in local configuration. The anticipated anonymous 401 was not obtained, so authenticated runtime acceptance remains unverified. No migration or provider change was needed.

Remaining: catalog/create-or-connect entry flow, actual product authorization, Scalar control transport, hosted workers and real connected lifecycle acceptance. This increment starts from an already requested connected instance; it is not the complete provisioning flow. No task is marked Done.

## Application catalog and setup entry — 2026-09-21

Applications now includes an administration-only catalog with registered descriptions, supported organization setup modes, capability/permission/usage/connection disclosures and honest unavailable state for draft or malformed registrations. Setup records primary-instance intent through the existing orchestration; connected instances continue through the previous connection-target form. No product is activated by requesting setup. Cost estimates and provider authorization remain unfinished and are not fabricated.

The public setup API now rejects unknown body fields and uses requestCatalogProductInstance, which checks applications.manage and ready, valid catalog metadata with the requested supported organization mode in the same service transaction. The earlier internal enableProductInstance intent helper remains compatible with controlled draft/test setup and is not used by this public route. Neither helper grants provider access; readiness is not a substitute for worker/provider activation checks. Catalog projection omits provider URLs and raw metadata. Registration changes after intent still require worker revalidation at execution.

Verified: 199 automated tests (30 contracts, 25 database, 144 web), typecheck, lint and production build. All 76 desktop/mobile fixture browser checks pass and both catalog screenshots were inspected. Expanded restricted-login catalog/setup tests also passed on hosted verification PostgreSQL (15.74 seconds): foreign tenant denial, draft/malformed/unsupported/retired registration denial, valid idempotent pending setup and allowlisted catalog output. No migrations or production fixture writes. Prior application commit 61a3aa5 passed CI run 35658395141.

Real OAuth, complete product disclosures/estimated costs, verified product authorization, Scalar transport and live sponsored access remain open. The seven reference products were not promoted to ready by this work. Phase 02 and its real-provider tracker acceptance remain incomplete.

## Preserve applied limits through readback timeout — 2026-09-21

Reproduced a dispatcher defect with a restricted PostgreSQL integration regression: an immediate successful provider apply followed by readback that exceeded the deadline was stored as a generic apply failure, losing the provider's successful receipt. The old implementation raced the entire pair and assigned receipts only after both calls completed.

The worker now bounds each awaited call against the same 60-second overall deadline, retains a completed apply result before reading state, and records readback timeout/exception separately as a normalized retryable failure. Late provider completion cannot rewrite local receipts or completed journal rows. The same idempotency key and existing five-attempt, lease, current-policy and tenant fences remain in force; a timeout does not imply provider cancellation, and an apply receipt alone never confirms enforcement or grants access.

The regression failed before the fix (expected succeeded apply, received retryable_failure), then passed locally and on hosted verification PostgreSQL (47.30 seconds). Coverage includes late readback completion, readback exceptions with private detail redaction, stable retry key and existing revocation/immutability checks. All 199 automated tests, typecheck, lint and production build pass. No UI or migration changed; the previously recorded 76 browser checks were not rerun. Application catalog commit fef03b4 passed CI 35658896236. No live provider or OAuth acceptance is claimed.

## Health observation validation prerequisite — 2026-09-21

Added runtime validation for the existing adapter getHealth success value without changing the adapter version. All seven canonical statuses are preserved. Timestamps must be explicit ISO instants; synchronization/failure history cannot follow checkedAt; affected member counts are nonnegative safe integers. Unknown fields and oversized provider status text are rejected. The public health assessment omits provider free text, preserves explicit zero counts and does not manufacture provider status, authorization or member access.

Freshness uses an explicit caller-supplied positive age and trusted clock. At the expiry boundary an observation is stale; a future observation is unknown instead of extending freshness. Missing/malformed observations are unknown. A stale healthy observation cannot be treated as current health. This helper is not yet wired to durable collection or administration; callers must supply the eventual operational polling policy.

Verified: all 227 automated tests (58 contracts, 25 database, 144 web), typecheck, lint and production build. Contract regressions cover each canonical status, offset timestamps, freshness boundary, future/history contradictions, invalid counts, invalid freshness configuration and free-text omission. No migration/UI/provider changes; prior 76 browser checks were not rerun. CH-19 acceptance remains incomplete pending scoped durable observations, collector scheduling, admin status display/recovery actions and real provider checks.

## Durable application health collection — 2026-09-21

Migrations 0041–0042 add append-only runtime health observations with tenant/instance foreign keys, timestamps, normalized failures and the checked provider binding. The dedicated NOLOGIN company_human_health_worker role can read its tenant/product scope and append observations/service audit; it cannot change product access, policies or completed observations. General service credentials cannot collect health. No production worker login or schedule has been created.

collectApplicationHealth accepts only a trusted registered adapter and canonical scope, checks the current bound instance before calling getHealth, enforces a ten-second deadline, validates health data and strips provider free text. Exceptions are normalized, future/malformed observations fail closed, and an in-flight retirement or changed binding cannot become a current observation. Observation and service audit commit atomically. The adapter remains responsible for authenticating the exact organization; no real adapter or remote-health proof is supplied by this infrastructure.

readApplicationHealth requires applications.manage, filters the current provider binding and chooses the latest-started check rather than whichever response finishes last. A failed latest check never falls back to old healthy. Freshness uses a five-minute monitoring policy and the database clock, not an authorization grant. Provider IDs, raw errors and free text do not enter the public projection. Administrative UI and recovery controls remain to be wired.

Verified: 228 automated tests (58 contracts, 26 database, 144 web), typecheck/lint/build; the expanded health scenario passed locally and on hosted verification PostgreSQL (28.37 seconds). It covers wrong role/tenant/product, stale/future health, private-text removal, latest failure, retirement during collection, obsolete bindings, reversed completion order, audit rollback and denied writes/deletes. Migrations 0041–0042 were verified before production application; no production fixtures were inserted. There are 42 migrations in the schema. No UI changed; prior 76 browser fixtures were not rerun. Previous commit 75aefb2 passed CI 35659570027. CH-19 and real-provider health acceptance remain open.

## Application health administration page — 2026-09-21

Added a dedicated instance health page linked from Applications. It checks applications.manage before reading the current authenticated organization and user scope. Unavailable/foreign instances and infrastructure failures expose normalized copy; a valid connection with no observation renders an explicit empty state. The view includes all seven provider statuses, check/record/observation times, last sync/failure and affected-member count without inventing missing values or dropping zero.

Stale observations explicitly leave current health unknown. Latest failed checks show failure instead of an old healthy result. Authorization-required copy identifies the unavailable reauthorization workflow without a nonfunctional reconnect action. Refresh reloads stored observations; it does not claim to trigger a provider check. Existing typography, cards and button primitives are reused.

Verification: 149 web tests pass, including five page tests for authenticated scope, pre-query permission denial, unauthenticated access, missing configuration and error redaction. Together with the recorded unchanged 58 contract and 26 database checks, the current total is 233. Typecheck and lint pass. The runtime changes passed production build; adding the five page tests did not alter runtime code. All 80 desktop/mobile fixture browser checks passed, including healthy, stale, failed, degraded, reauthorization and never-checked health states, refresh and overflow checks; desktop/mobile screenshots were inspected. Browser evidence uses explicit fixtures, not real authentication or provider observations.

No migration or provider configuration changed. CH-19 has implemented/local-verified display behavior; live authenticated acceptance, operational health collection, recovery controls and real Scalar checks remain open. This task does not complete Phase 02.

## Isolated Convex development environment — 2026-09-21

Configured and deployed this checkout to an anonymous local Convex backend, avoiding the recorded cloud-development quota. Preserved existing local database entries and cloud production configuration. Ignored local deployment state and secrets; generated separate local signing keys in memory. Convex TypeScript, real local OIDC discovery, public-only JWKS and anonymous identity query passed. See authentication.md for startup and callback configuration. No fake user/session or OAuth bypass was added. Real provider credentials, consent and authenticated tenant lifecycle remain outstanding. No application runtime code or database migration changed; prior application tests were not repeated for this environment/documentation change.

## Real local anonymous authentication runtime — 2026-09-21

Added `npm run test:runtime:anonymous -w @company-human/web`, a separate Playwright suite against the running Next application at 127.0.0.1:3000 and isolated Convex at 127.0.0.1:3210. Start both services first, with no AUTH_ENABLED_PROVIDERS configured. The suite does not mock routes, identities or provider calls, and does not seed users or create organizations. It is excluded from Vitest and remains separate from the Vite fixture suite.

Four desktop/mobile checks passed against the actual development server: local Convex anonymous identity is null; organization listing and same-origin identity sync return 401; missing/foreign mutation Origin returns 403; unconfigured sign-in has no provider button; the organization selector presents a sign-in link and no create/open action; protected Applications redirects to sign-in. No browser page errors or horizontal overflow were observed, and both screenshots were inspected. Typecheck and lint passed. The first browser run found a selector collision with Next's accessibility announcer; the selector now targets the application alert by its expected message.

This proves anonymous denial and rendered configuration/error states in a real local runtime. It does not prove OAuth consent, session establishment, tenant lifecycle or production deployment. The existing 233 automated and 80 browser fixture counts remain distinct from these four runtime checks. No application behavior or migration changed.

The local production build compiled successfully but failed while writing its TypeScript/Turbopack cache with ENOSPC. Only this repository's generated `.next` output was removed afterward. This run is not a passing production build; hosted CI remains the build gate for this test-only increment.

## Production-build anonymous runtime CI — implemented; verification below

The quality workflow now runs scripts/verify-anonymous-runtime-ci.mjs after the fixture browser suite. The runner is restricted to GitHub Actions with a loopback company_human_test database and refuses preexisting deployment selection or .env.local. It creates separate nonsuperuser/non-BYPASSRLS database logins, starts an anonymous local Convex backend, waits for actual identity function deployment, sets independent ephemeral signing keys, builds the app with the local public URL, starts next start and runs the four real-runtime anonymous checks. No production secret or OAuth provider credential is required. Private keys/passwords are not printed or uploaded. The ordinary production build is performed inside this step so its compiled client targets the ephemeral backend.

Syntax/diff checks passed locally. Full CI execution is required before accepting this workflow change; it cannot run against the existing developer checkout by design. Real OAuth and tenant lifecycle remain separate acceptance gates.

## Hosted production-runtime verification — 2026-09-21

CI run [35662114990](https://github.com/mosnin/company-humans/actions/runs/35662114990) completed successfully at application revision `3d26a8b`. Inspected job output confirms 58 contract, 26 database and 149 web tests; 80 fixture browser checks; local Convex function deployment; production compilation and TypeScript; and four actual-runtime browser checks against next start. The run also passed clean install, typecheck, lint, all migrations and seed. Runtime subprocess shutdown and job cleanup completed successfully.

This closes the production-build gate left open by local ENOSPC and verifies the new CI runtime procedure. It establishes anonymous access denial and configuration/error presentation with a real isolated backend and built web server. It does not establish OAuth consent, authenticated canonical synchronization, two-organization journeys, live Scalar access or a production deployment. Phase 01 and Phase 02 remain open.

## Contributor application assignments — 2026-09-22

Added /workspace/apps and an Apps navigation item for every active workspace member, addressing Phase 02 member application visibility. The server derives user and organization from authenticated workspace context. The restricted read login can select only assignment status columns; migration 0043 adds an own-active-membership RLS policy. Provider identifiers are not granted. The view presents assigned product names and preparation, paused, unavailable or access-verification-needed states. An active mapping alone does not create a launch link or claim live provider access. Missing assignments and read failures have distinct states.

Verified: 237 automated tests (58 contracts, 26 database, 153 web), typecheck, lint and production build pass. Expanded assignment integration passed locally and on hosted verification PostgreSQL (14.95 seconds), covering own assignment, foreign organization/user denial, owner-credential rejection, forbidden provider-column reads and writes, and disabled-state projection. Four page tests cover authenticated scope, no-workspace denial, normalized errors and non-granting states. Real OAuth and provider launch are still pending; this page does not fulfill the complete sponsored-access journey.

All 80 existing desktop/mobile fixture checks also pass after the Apps navigation change. Migration 0043 is applied to both local databases and hosted verification/production, with production replay current. No provider assignment or production fixture data was created. Notion write tools are unavailable in this turn, so tracker synchronization remains pending.

## Contributor authentication correction — 2026-09-22

User direction: Google and email magic links replace GitHub sign-in. GitHub is removed from provider registration and UI allowlisting. Convex remains the session authority. Email is delivered through Resend with AUTH_RESEND_KEY and AUTH_EMAIL_FROM on the dedicated Convex deployment; Google needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET. AUTH_ENABLED_PROVIDERS=google,email is enabled on the web deployment only after the corresponding provider configuration is verified.

Magic links expire after 15 minutes, preserve the invitation return route, and open an email confirmation page before token redemption. The custom identity callback permits an unverified email account at request time but only stamps verification after token redemption. It never merges Google and email accounts by matching email. Google and email using the same address remain separate identities pending an explicit secure linking flow.

Production delivery, Google consent, token replay/expiry in the running backend, and the authenticated workspace/invitation journey remain unverified. No provider credentials were fabricated or copied from another product.

Validation: 157 web tests passed, repository typecheck/lint and production build passed. Actual Chromium against the production build displayed the email confirmation and rejected a missing token without page errors. This does not verify real email delivery or Google consent.

### Email authentication lifecycle verification

Six additional tests run the actual Convex Auth actions/mutations, Company Human callback, token storage and session creation inside convex-test. Only outbound Resend delivery is intercepted. They prove verified identity after redemption, invitation return in the issued URL, one-use redemption, expiry, email substitution denial, old-link invalidation on resend, recipient and global request limits, transactional rollback on denial, and hourly capacity reset. All 163 web tests pass. This is integration-harness evidence, not live provider delivery or a hosted authenticated browser journey.

The browser harness now exercises Google and email instead of the removed GitHub provider. Added desktop/mobile checks for email normalization, invitation redirect, delivery acknowledgement, resend form, cross-tab invitation restoration and expired invitation removal. CI run 35691393318 failed because its older fixture expected the removed GitHub button; that stale expectation is corrected here.

### CH-20 immutable usage storage

Local migration 0044 applied successfully to the dedicated PostgreSQL verification database. The real PostgreSQL integration test verifies owner-role rejection, signed-event insertion, exact retry deduplication, altered-payload conflict, signature tampering rejection, signing-authority tenant mismatch, unknown-meter quarantine, preservation of the original signed decimal representation, RLS read denial for another tenant, and update/delete rejection for event/meter history. Fixtures run inside a rolled-back transaction. All 250 tests pass (60 contracts, 27 database, 163 web); repository typecheck and lint pass. Hosted CI and live provider ingestion remain separate gates.

The usage endpoint adds seven boundary tests with genuine HMAC verification and a mocked storage call: valid service ingestion, tampering, tenant/instance/source/environment mismatch, expired/revoked/unknown keys, actual byte limit, accepted/quarantined/duplicate/conflict receipts and redacted failures. All 257 tests pass (60 contracts, 27 PostgreSQL, 170 web), plus typecheck, lint and production build. An actual running production build returned 401 for unsigned JSON, 415 for non-JSON and 413 for an oversized payload. These are local runtime checks, not real provider usage acceptance.

Before release, migration 0044 was corrected to reuse an existing safe NOLOGIN role when multiple databases share a PostgreSQL cluster. Only its empty local verification tables and migration record were reset, after checking zero rows; no production database or usage history was changed. Reapplication and migration replay tests pass. Hosted migration rollout is still pending.

CH-21 preparation: a real PostgreSQL integration test covers exact accumulation beyond individual-event precision, meter/version/unit separation, last-value ties, delayed events, environment/quarantine exclusion, tenant isolation, suspended contributors and revoked team managers. Nineteen route tests cover authenticated scoping, strict query validation, unavailable identity/database and error redaction. Repository tests, typecheck, lint and production build passed before this checkpoint. No real product usage or billing acceptance is claimed.

Human provenance regression tests reject nonexistent/mismatched actor users, foreign memberships/teams and direct SQL parser bypass; delayed suspended-member usage remains accepted. The production-build runtime script `scripts/verify-usage-runtime.mjs` creates a disposable local database and restricted random login, runs migrations, starts Next, sends two simultaneous signed copies and verifies exactly one accepted row (201/200), 409 for changed retry, 401 for tamper, and 202 for unknown meter. It then drops only its own random test database/login. This actual HTTP-to-PostgreSQL check passed locally. Run with a local DATABASE_URL after npm run build. Hosted/provider acceptance is separate.

Quarantine recovery has a real PostgreSQL regression test covering unauthorized/foreign/suspended actors, missing/wrong meter version, preserved original event/signature, immutable provenance, retry without duplicate accounting, and customer RLS before/after release. Twenty POST route tests pass for trusted actor binding, origin denial, invalid inputs, error redaction and retry receipts. Combined repository tests passed before the route addition (70 contracts,29 database,189 web), with its additional20 tests separately passing; typecheck/lint/build passed.

Member access conformance: nine tests pass, including deliberately defective adapters that fail stale replay, execution-time fencing, same-revision capability/quantity changes or omitted limits. Independent review found and corrected initial gaps in pending-work and complete-policy coverage. Passing the reference fixture is not a real provider test.

Usage presentation:14 server-page tests and5 navigation tests verify permission gating, trusted scope, calendar/environment validation, exact quantities and assigned-team-manager navigation. Twelve desktop/mobile Playwright fixture checks pass with2 workers, covering product/meter names, large exact fractions, GET filter values, empty/error/permission states and no horizontal overflow. Root inspected the mobile screenshot. Fixtures explicitly mock backend data; authenticated production acceptance is separate. Full repository typecheck, lint and production build passed with the page integrated.

Release checkpoint71e6b7c: local Usage page/type/lint/build checks passed. An isolated clean checkout was uploaded to Vercel, but deploymentdpl_5AAds5PpxjBrJFXxyUQQvgRGp8t4 was BLOCKED with the team-configuration documentation link before building. Production still serves the previous accepted deployment. GitHub API reports no linked author for the old commit email; local future commit attribution now uses the authenticated mosnin account's GitHub no-reply address. Existing history is preserved. This is a deployment repair in progress, not a successful release.

0048 integration covers atomic disable→journal/job, restricted writes and tenant denial, rejection of legacy adapters, readback failure reconciled without duplicate mutation, higher removal while prior suspension is outstanding, visible missing-binding failure, and org/member/fence changes after claim. Independent review identified and closed the initial binding-completion and silent-stall defects. New synchronous jobs required fixture cleanup ordering fixes; production foreign keys remain intact. Full current working-tree checks passed:70 contracts,33 database and232 web tests, typecheck, lint and build (includes subsequent local identity-offboarding work, recorded separately).

Identity-offboarding verification: real restricted database tests cover cross-organization fan-out, unaffected same-org/foreign users, service provenance, stale/duplicate profile events, concurrent mapping insertion/deletion in both observed lock orders, direct privilege denial and audit-failure rollback. Historical backfill preserves source identity timestamps/status and replays without duplicates. Fresh database migration through0049 passed, then0050 normal runner/replay passed. The manually applied local0049 test schema was reconciled to its byte-identical source checksum after inspecting trigger/function ownership; concurrent fixture rows were retained. Final repository checks pass:70 contracts,34 PostgreSQL,234 web tests (338 total), typecheck, lint and production build. Hosted0048–0050 rollout remains separate.

## Immutable hosted migration release

From an installed checkout using Node24, set DATABASE_URL securely for the intended verification database and run `node scripts/migrate-release.mjs <committed-sha>`. The script extracts only that commit's SQL and matching runner; unfinished worker files are excluded. Verify targeted database tests before repeating the same committed revision on production. Never run integration tests against production. Release migration replay at fe45da6 returned an empty applied list on hosted verification. Credentials are never command-line arguments or committed files.

0051–0053 final local verification:340 automated tests passed (70 contracts,35 PostgreSQL,235 web), followed by repository typecheck, lint and production build. Full-suite cleanup and old desired-disable assertions were corrected to match retained audit records and honest pending state. Independent review accepted tenant grants, provenance, exact receipt projection and UI precedence. Hosted and real-provider acceptance remain separate.

0051–0053 hosted verification: capability preparer/worker, denial worker and application mapping tests passed; policy invalidation passed after removing unnecessary DROP OWNED cleanup for fixture logins that own no objects. The hosted policy retry passed in23.18 seconds. These migrations were then applied to production from committed0726914; no integration test or fixture was run against production.

0054–0055 local verification:341 automated tests (70 contracts,36 PostgreSQL,235 web), root typecheck/lint/production build, and fresh55-migration replay pass. Permission invalidation tests explicitly observe PostgreSQL lock waits for both assignment/revocation orderings, then verify committed denial. Backfill tests invoke the private helper through its owner role, preserve authorization truth and prove a second run has no effects. No real provider or hosted54/55 result is implied.

0056 local focused verification: migration applied to dedicated security verification database; capability preparer and worker integration tests passed. The preparer regression checks extra catalog permission loss, target-versus-owner scope, restoration, source fingerprint and unknown requirement denial. Full root gates and hosted rollout follow the bounded task commit.

0057 local regression covers positive member-limit permission checks, revoke-and-restore access revision fencing, additional catalog permission removal during a provider call, retained zero-stop delivery, cross-tenant denial and immutable receipt handling. The fixture explicitly resets policy_blocked using the migration owner to isolate the worker's claim fence; production has no corresponding activation path.

0058–0059 local security integration proves tenant scope, current fenced job creation, compact receipt rejection, no automatic restoration, audit rollback, restricted recovery helper and historical idempotency. A fresh disposable PostgreSQL database replayed all59 migrations and the organization test; it was removed afterward. General service organization-status mutation remains blocked pending an authorized lifecycle API.

0060 catalog integration uses two organizations plus an unrelated product and unbound assignment. It proves display-only edits leave access alone; access contract edits and retirement create tenant-specific durable denial; the requirement-list edit succeeds only with matching audit; a compact receipt fails while the full current receipt succeeds; historical non-ready reconciliation is idempotent; and runtime roles cannot execute the helper. A fresh disposable PostgreSQL database replayed all60 migrations and passed this test. The pending-bind concurrency fence remains a separate acceptance test.

0061 catalog binding integration proves both transaction orders and observes a real PostgreSQL advisory Lock wait with separate catalog and bootstrap connections. It covers a stale provision command in each tenant, a legacy unstamped command, one-mapping denial, compact-receipt rejection, full fenced-receipt success, audit-failure rollback, private helper privileges and ready-to-draft bind refusal. The root full gate replayed 61 migrations, seeded the catalog, and passed 344 tests (70 contracts, 39 database, 235 web), typecheck, lint and production build on a fresh disposable database. The database was removed after verification. This remains fixture-provider evidence, not live Scalar access.

Hosted verification from immutable `12b1a01` applied 0060–0061 and passed four focused database integrations in 90.73 seconds. The same committed migrations were then applied to production without fixtures. The first hosted attempt at `ea957f7` rolled back because the migration login did not own the binding function; its unapplied SQL was corrected and fully replayed before the successful release. CI run35799492335 passed clean migration/seed, tests, typecheck/lint, browser checks, production-build anonymous runtime and signed-usage HTTP verification. Real provider execution remains a separate gate.

0062 local verification replayed all migrations on a fresh seeded disposable PostgreSQL database and passed 345 automated tests (70 contracts, 40 database, 235 web). Root typecheck, lint and production build passed. The permission integration covers two tenants, selective product revocation, ordered authorization-lock waiting at pending binding, full fenced receipt, audit rollback, role reassignment, direct cross-organization grant movement, transaction deduplication, malformed/unknown requirements and idempotent historical reconciliation. Ready-state regressions cover capability staging, bootstrap, positive member limits and contributor/admin availability. Fixture provider results do not establish remote enforcement; hosted and production evidence follows separately.

Database integration files run with one Vitest worker because several create temporary PostgreSQL roles and audit triggers in the same test database; parallel schema DDL intermittently deadlocked an unrelated audit test. This serializes only the database package tests, preserving concurrency inside explicit multi-client tests.

Hosted verification applied 0062 from committed `27c3845`; six of seven focused integrations passed. The seventh exposed a test-fixture privilege assumption: the hosted migration login correctly could not execute the private permission predicate. The test now switches to the restricted binding role and passed from immutable `73caa23`, as did a fresh local replay. CI35801107594 passed all contract, database, web, browser, runtime and signed HTTP gates. Production applied the same migration without fixture writes. The final production Vercel deployment `dpl_2AwQgqQNMaRBtF4egDYXxVGKyzBn` reports revision `73caa2354702dd02add502b132906eddeae7a3ec`; live anonymous organization and unsigned JSON usage requests return401, and Apps redirects to sign-in. These checks do not demonstrate authenticated product access or provider execution.

0063 focused local integration covers no provider calls after missing permission or policy block, a held real asynchronous adapter call followed by permission revocation, cross-tenant unaffected provisioning, catalog requirement changes during a lease, persistent blocked state, tenant-bound wrapper execution and denial of the raw predicate to bootstrap/web/service roles. Provider responses are fixtures. The worker retains late provider references without binding, so remote cleanup is a remaining acceptance gate.

Final local 0063 gate: fresh PostgreSQL migration0001–0063 and seed succeeded; 346 automated tests passed (70 contracts, 41 database, 235 web), followed by repository typecheck, lint and production build. Existing catalog/authorization race fixtures were adjusted to grant required permissions before claiming work and remove them during the in-flight operation.

The initial hosted `1287cd6` migration rolled back on a redundant REVOKE attempted by a non-owner migration login. The corrected unapplied migration at `89813dd` replayed all 63 migrations locally with 346 passing tests, then applied to hosted verification. Four focused hosted bootstrap, authorization, catalog and existing worker integrations passed in 108.36 seconds. CI35802166423 passed all gates. Production applied 0063 without fixtures; Vercel deployment `dpl_25nSrbJTbyW9CMiSiXTutpUzy1rR` is READY with exact live health revision `89813dda05c32bc9f3087d7f8ffb5c4f7ab4ef94`. Anonymous organizations and unsigned JSON usage return401; Apps redirects to sign-in. This is not proof of live provider provisioning or authenticated contributor access.

0064 local gate: a fresh disposable PostgreSQL database replayed migrations 0001–0064 and seeded the catalog. The full suite passed 347 automated tests (70 contracts, 42 database, 235 web), followed by typecheck, lint and production build. The new restricted-service test covers direct SQL denial for draft products, malformed catalog fields beyond permissions, missing grants, unknown requirements, unsupported instance modes or member operations, and foreign tenants. It observes real lock waits with both commit orders for catalog edits, role revocation, organization suspension and requesting-actor suspension. Existing lifecycle tests use explicit ready test products, while the historical reconciliation test inserts its malformed legacy row only through the privileged fixture. Application requests reject ineligible targets and existing blocked mappings; the admin candidate projection excludes them. Provider access, hosted migration, CI and deployment remain separate gates.

Release verification: hosted verification applied 0064 from immutable `fd6ca8c`. Its first focused suite passed five of seven; privileged historical fixture insertion and role cleanup failed under the restricted hosted migration login. A direct 0064 edit would have broken its applied checksum, so additive 0065 contains the actor-context guard, and the test now revokes grants explicitly. A fresh 65-migration database passed 347 tests, typecheck, lint and build. Hosted applied 0065 and the two previously failing integrations passed in 40.73 seconds; the five other focused integrations had passed on 0064. [CI 35804999892](https://github.com/mosnin/company-humans/actions/runs/35804999892) passed all gates on `fb90c78`. Production applied 0064 and 0065 without fixtures. Both hosted databases replayed with no pending migrations. Production deployment `dpl_2mNQzy8DjS4hsmHcjLDxCTfPRcxe` reports exact live health revision `fb90c789b1cee213bf4427c71b0569a986dcf1be`, with anonymous organizations and unsigned usage denied and Apps redirected to sign-in. Provider/OAuth acceptance remains open.

Activation readiness local fixture uses a restricted service login and two tenants. It verifies dual administrator permission, foreign mapping isolation, missing bootstrap/capability/limit evidence, pending fenced denial, reconciled denial readback, exact current capability and finite limit receipts, stale catalog capability source, revised limit, inactive target, and no grant. Even with all local receipts present, the only remaining reason is `meter_semantics_unverified`. A fresh disposable PostgreSQL database replayed and seeded migrations 0001–0065 and passed 348 tests (70 contracts, 43 database, 235 web). Repository typecheck and lint passed. This is fixture evidence; no provider hard stop, OAuth journey or live Scalar grant is accepted.

Hosted verification ran the focused diagnostic integration successfully against the managed PostgreSQL role setup. Both hosted databases replayed committed `8842d0b` with no new migration. CI35806677583 passed its full quality workflow, including browser and actual HTTP checks. Vercel deployment `dpl_5QABSKCeoAMyv5fLBk5hdSgQgsU4` reports the exact live code SHA; anonymous organization and unsigned usage requests return 401, while Apps redirects to sign-in. These probes do not exercise a real authenticated member or provider.

The meter enforcement declaration contract tests valid pinned meter fields, duplicate keys/windows, invalid version/unit/scope/mode shapes, extra verification flags and explicit empty declaration. They establish schema parsing only; they do not prove registered-meter completeness, V1 limit compatibility or provider behavior. A fresh local migration/seed and full suite passed 351 tests (73 contracts, 43 database, 235 web), plus typecheck, lint and production build. No new migration or provider call was introduced.

The V2 usage-limit contract tests positive meter versions, V1/infinite rejection, scope-to-target agreement, complete exact readback including identity and meter version, malformed provider results and rejection of V1-only adapter registrations. A fresh database replayed and seeded 0001–0065; all 355 automated tests passed (77 contracts, 43 database, 235 web). Root typecheck, lint and production build passed. No V2 storage or provider execution was exercised.

For migration 0066, the existing finite-limit integration verifies V1 rows default to contract version 1/null meter version, direct service V2 writes fail, invalid V2 meter versions fail, privileged V2 fixture rows enqueue no V1 job, the V1 setter refuses a V2 latest row, and V2 cannot downgrade to V1. The V1 worker integration still passes. A fresh 66-migration/seed replay and 355-test suite pass with typecheck, lint and build; this is storage safety, not provider proof.

Hosted verification applied committed 0066 and passed both affected integrations in 75.31 seconds. Production applied the same migration without fixtures; both hosted databases replay with no pending migration. CI35808701374 passed. Production deployment `dpl_DHZK6LQ2ZW5w9oXphARjfDnTpw82` reports exact revision `9b1bf72ea2522f27906c2c605f5ca913db765abc`; anonymous organization and unsigned usage requests deny access, and Apps redirects to sign-in. No real OAuth or Scalar enforcement was exercised.

The 0067 operator-comparison integration uses a repeatable-read transaction and a restricted role. It checks read-only privileges, current product revision and meter set, exact registered version/unit/aggregation, extra or duplicate catalog keys, malformed metadata, retired readiness and an empty declaration that still cannot certify a provider. A fresh 67-migration/seed replay passed 356 tests (77 contracts, 44 database, 235 web), typecheck, lint and build. The comparison makes no provider call and does not enable access.

The focused 0067 integration passed against hosted verification in 2.67 seconds. Both hosted databases replay the committed revision with no pending migration. CI35809446576 passed; Vercel deployment `dpl_3ecRePNoXdgtFXnmG1WyCAdoX8qy` reports exact revision `77ac96c425bb1efb0e7a245dcdb901f36c2e7624`. Anonymous organization and unsigned usage requests deny access and Apps redirects to sign-in. No authenticated or live provider scenario was exercised.

Removing the unused `tw-animate-css` package and global import was verified with a clean Node 24 install, root typecheck/lint/build and all 96 desktop/mobile Playwright fixture checks. The spinner remains on Tailwind's built-in `animate-spin` utility. These browser checks use fixture data, not real OAuth or provider access.

The cleanup commit `f09b190bbf3ed3af3af39d0de68b96c68a6c9897` passed CI35810067348 and deployed READY as `dpl_EhckRwBxTxEEjAeiQNy15wSW6ZDQ`. The production health response reports that exact revision. Anonymous organizations and unsigned usage POST return 401; Apps redirects to sign-in. Real authenticated Google/email and product-provider flows remain unverified.

The first CH-22 budget contract slice has tests for exact decimal thresholds, all applicable parent/child constraints, capability separate from meter, one operation team among multiple memberships, missing/foreign attribution, cross-tenant/product/meter rejection, deterministic ordering and warning versus later hard-stop thresholds. A fresh disposable database replayed and seeded migrations 0001–0067; 364 tests passed before the independent-review corrections (85 contracts, 44 database, 235 web). The reviewed contract then passed all 86 contracts tests, root typecheck, lint and production build. Product and product-instance scopes, the distinct budget ID and malformed team context without team policies have regression coverage. This validates pure resolution only; the caller's complete policy fetch, team membership evidence, budget storage/evaluation and provider enforcement are unverified.

The corrected budget contract commit passed CI35811343564. Deployment `dpl_AX2PbEk7ETTS9oJLi7nxBU7Y3n5J` returned the exact live revision `46d19d0768fe6387680d30c6b6a90018c28ac323`. Anonymous organization and unsigned usage requests returned 401; Apps redirected to sign-in. No authenticated member or budget-gated provider operation was exercised.

Migration 0068 applied and seeded on a fresh disposable local PostgreSQL database; all 45 database tests passed, including one restricted-history integration for assignment, removal, reactivation, role changes, gaps, rapid transitions, immediate no-delay remove/rejoin and delete/reinsert, foreign tenant, rollback, restricted service-trigger execution and runtime write denial. A separate disposable 0001–0067 setup inserted an active and ended assignment before applying the final 0068 SQL, then verified one conservative active baseline, no fabricated closed intervals, ended-row exclusion and valid closure (`baseline_verified`). Independent review caught and verified fixes to trigger-creation privilege order and monotonic interval starts. Root typecheck, lint and production build passed after those fixes. Usage-ingestion temporal enforcement remains a separate gate.

The exact committed 0068 migration applied to hosted verification using its non-superuser migrator. The focused integration then passed there (1/1, 4.05 seconds). That fixture does not establish live usage team-attribution acceptance.

CI35812612607 passed the committed 0068 revision. Production applied 0068 without fixtures, and both hosted migration replays returned no pending SQL. Deployment `dpl_7ARqyJWGsf5koykAqUQxs1TWJWAe` reports exact live revision `452752663b4c3a81322b82ed634ac510a3c99d60`; anonymous organizations and unsigned usage POST return 401, and Apps redirects to sign-in. The browser and HTTP checks do not exercise temporal team attribution.

Migration 0069 applied and seeded on a fresh disposable PostgreSQL database. A focused restricted-role integration passed for active and closed team intervals, delayed signed usage, exact and altered retries after removal, gap and future rejection, wrong same-tenant team, pre-cutover uncertainty, direct SQL denial, private-table isolation, and quarantine release revalidation. A separate opt-in two-client test on a fresh disposable loopback database proved both commit orders with observed PostgreSQL lock waits, rejected the exact closed-interval end, and produced one row plus a duplicate receipt from concurrent exact signed callers. The complete local suite passed 369 tests (86 contracts, 47 database, 236 web); root typecheck, lint and production build passed. Independent review accepted the bounded temporal guard. These local tests do not demonstrate a provider hard stop or a complete budget engine.

The exact committed 0069 migration applied on hosted verification under its non-superuser migrator; its focused restricted-role integration passed there (1/1, 4.68 seconds). [CI run 35814341262](https://github.com/mosnin/company-humans/actions/runs/35814341262) passed migration, seed, tests, typecheck, lint, browser checks, real anonymous runtime and signed usage HTTP checks. Production applied the same committed migration; both hosted replays have no pending SQL. Deployment `dpl_BWaRXebmgbb9MDFpsHYcFGbnkyJj` is READY on https://company-humans.vercel.app; health reports exact revision `780d01801f49ebe9e937420e4b3d5786ff712c75`. Anonymous organizations and unsigned usage POST return 401; Apps redirects to sign-in. Read-only checks found zero accepted human events naming a team before 0069 in either hosted database. These anonymous probes and fixtures do not prove live provider team binding or budget stops.

Migration 0070 applied and seeded on a fresh disposable local PostgreSQL database. The direct SQL integration passed 2/2 for tenant and scope references, finite quantities, immutable history, restricted roles, catalog validity, a two-client revision race, both permission revocation commit orders, and revoke-first catalog, membership and user changes. It also rejects higher-isolation mutation transactions that could retain stale authority. A separate opt-in disposable loopback writer integration passed for all seven scopes, multiple warning/stop thresholds, exact quantities, complete current read, concurrent optimistic revision conflict, disable projection, audit and tenant permission denial. The complete suite passed 438 tests (89 contracts, 49 database, 300 web), with one separate temporal race test skipped by its opt-in gate; root typecheck, lint and production build passed. Hosted migration, CI and deployment remain to be verified. No provider was called and no budget stop was tested.
