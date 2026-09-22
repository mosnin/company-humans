# Implementation status

Updated 2026-09-21. Destination: `mosnin/company-humans`, branch `codex/company-human-foundation`, [draft PR 1](https://github.com/mosnin/company-humans/pull/1). Company OS remains unchanged.

Current remaining work and acceptance gates: [remaining phased build plan](remaining-build-plan.md), refreshed against the canonical Notion roadmap; subsequent health-page and isolated-runtime delivery evidence is recorded below. Historical sections below retain their original evidence counts and deployment state.

## Verified locally

- Shared canonical IDs, signed event/audit contracts, migration checksums, deterministic product seeds, and versioned adapter interface.
- A restricted test service creates real canonical users, organization and membership, then signs a shared event; changing its tenant invalidates the signature.
- Identity synchronization, tenant isolation, stored capabilities, audited permission changes, invitation lifecycle, team scope, and append-only runtime audit permissions.
- Direct contributor SQL cannot promote itself, change the organization, become a team manager, grant permissions, or activate a product.
- People, Teams, Permissions, and Audit pages use scoped services. The shell generalizes Company OS's header, rail, canvas, form, and table design.
- Invitation acceptance requires the authenticated Convex OAuth profile's verified email. The token survives sign-in in tab storage for 30 minutes and clears on acceptance.
- 233 contract/database/route/Convex tests pass. Eighty desktop/mobile browser component tests pass with explicitly mocked authentication/API responses. Typecheck includes test sources; lint and production build pass. Latest checked application CI at 3d26a8b passed in run 35662114990, including four separate real anonymous-runtime checks against a production build and isolated Convex backend.
- Local development/verification and hosted verification/production databases have 42 migrations applied, with seven reference-product seeds. Local credentials remain in ignored environment files, including mode-0600 Neon files; Vercel holds restricted runtime credentials. OAuth provider client credentials and real authenticated acceptance remain outstanding.

## Phase gates

| Phase | Status | Remaining acceptance |
| --- | --- | --- |
| Source scaffold | Implemented; local checks pass | Live authenticated layout and deployment verification. |
| 00 Foundation | Verified at 3fbc494 | Public GitHub run 35522115426 passed install, typecheck, lint, migrations, seed, tests, build and browser checks. |
| 01 Identity kernel | In progress | Real Convex OAuth sign-in/sign-out, browser create/invite/accept/assign/switch/suspend scenario, and acceptance of the latest deployed revision. Restricted web credentials are configured. |
| 02 Provisioning | In progress; groundwork only | Real Scalar adapter, provision/resume execution, entitlements, hosted worker, reconciliation, health, and full lifecycle proof. Suspend/remove execution has fixture-backed verification. Mapping and pending intent grant no access. |
| 03 Metering and billing | Not started | Measured Scalar usage, budgets, hard stops, cost and billing projections. |
| 04 Human workspace | Not started | Contributor Work, Apps, Context, Earnings, Leaderboard, Team, manager workflows. Identity administration is not this phase's completed shell. |
| 05 CRM and human work | Not started | Native records, assignments, visibility, actor attribution, Scalar sync. |
| 06 Company OS context | Not started | Real connection, approved scopes, freshness, revocation, denial. |
| 07 Attribution | Not started | Merchant links, SDKs, verified Chippi events and recoverable attribution. |
| 08 Commission and payout | Not started | Provider-neutral ledger, real provider execution and reconciliation. |
| 09 Ecosystem adapters | Not started | Real adapters and shared contract tests. |
| 10 Creator and UGC | Not started | Creator workflows with CRM/Scalar disabled. |
| 11 White label and enterprise | Not started | Branding, domains, bulk operations, templates and exports. |
| 12 Reliability and scale | Not started | Outbox, replay, recovery, security, privacy and load acceptance. |
| 13 Chippi dogfood | Not started | Real contributors and commercial loop. |
| 14 Pricing calibration | Not started | Production telemetry. |
| 15 External beta | Not started | Sales, referral and UGC organizations without forks. |
| 16 Platform expansion | Not started | Deferred until first-party contracts stabilize. |

## External gates

1. **Convex deployed; OAuth and development capacity remain:** dedicated free-plan project `company-humans` / production `sensible-dinosaur-165` was created and deployed on 2026-09-21. Signing keys, live anonymous identity denial, OIDC discovery and public JWKS were verified. A separate development deployment still fails with the 40-deployment quota. `SITE_URL` is configured; Google/GitHub provider configuration and actual OAuth round-trip remain required. See [authentication setup](authentication.md).
2. **GitHub Actions resolved:** the owner authorized making `mosnin/company-humans` public. Run 35522115426 at 3fbc494 passed all steps, including the Convex replacement. The earlier private-repository restriction no longer blocks CI.
3. **Production web:** https://company-humans.vercel.app is deployed with dedicated Convex and restricted PostgreSQL configuration. Health and anonymous denial are verified; real authenticated use remains unverified. No existing product deployment or credential has been reused.

CH-8, CH-9, CH-10 and CH-12 have progress evidence in Notion and remain In progress. The original findings remain in [implementation review](implementation-review.md); the authorization and invitation defects described there have subsequent repair commits. No later phase has been marked verified.

## Execution route and tracking source review — 2026-09-21

The full Notion hub and 17 documents were re-read and all 92 tracker tasks were compiled into the [goal route](execution/README.md), preserving phases 00–16 and the full product objective. Symbolic live Context/Flow remains blocked by a 401 response without OAuth discovery; no Symbolic run is claimed. [Callix tracking source](callix-tracking-assessment.md) was inspected read-only for Phase 07 reuse. Its browser observations are not verified financial conversions. Hosted CI run 35627020436 passed at product commit 4b9d614.

CH-15 independent repair: concurrent application enable intent is now serialized per organization/product/instance key. Eight simultaneous restricted-service requests return one pending instance and one audit event; mode conflict and cross-tenant denial remain enforced. Full provisioning state-machine acceptance is still outstanding. OAuth setup remains waiting for GitHub browser sign-in.

## CH-15 durable operation journal — 2026-09-21

Implemented and locally verified: atomic pending-operation creation with application enable intent; tenant-scoped claim leases; stable provider idempotency keys; five-attempt limit; retry scheduling; immutable completed attempt history; partial provider-reference persistence; stale-worker rejection; permission revalidation. All 38 tests/typecheck/lint/build pass. Production Convex remains deployed, but both GitHub browser sessions require sign-in before OAuth application setup can proceed.

The following dispatcher increment implements the restricted execution and activation boundary. Remaining work includes provider-specific repeat/poll semantics, hosted worker execution, member lifecycle/entitlement sequencing, admin operation diagnostics/retry UI, and real Scalar lifecycle proof. CH-15 and Phase 02 remain In progress. No connected access is claimed.

## CH-15 dispatcher and activation — 2026-09-21

Implemented and locally verified: product-bound dispatch; separate least-privilege provisioner role; runtime adapter-result validation; transport failure normalization; response deadline; pending-result retry using a stable key; atomic external-organization binding, activation, receipt and audit. Real PostgreSQL fixture tests deny general-service activation, direct worker identity/instance writes, wrong-product dispatch, disabled-instance activation and revoked-member completion. The full 39 tests, typecheck, lint and build pass; migrations 0020–0021 are applied in both local databases. Hosted CI for the prior journal commit ee7bf60 passed in run 35629434662.

Only fixture adapters were executed, on disposable local test records. No real ecosystem adapter or unattended worker is registered; Phase 02 and CH-15 acceptance remain incomplete. The next bounded work is admin operation diagnostics/retry/reconciliation and Scalar's real transport contract, while Phase 01 live OAuth still awaits provider setup.

## Applications diagnostics — 2026-09-21

The dedicated Applications admin page now displays tenant-scoped setup state, attempt counts, retry eligibility, normalized failures and expandable history using the inherited Company OS card/typography/layout primitives. Permission denial, empty, unavailable and pagination states are explicit. Connected organization state does not claim sponsored member access or live product health. The query requires applications.manage and projects no lease tokens or provider references. The enable API rejects cross-origin requests and no longer falsely labels existing active instances pending.

Verified: 41 automated tests (39 full-suite plus two new route tests), typecheck, lint, build and 20 desktop/mobile browser component checks. The new mobile screenshot was inspected. Authentication/API fixtures remain explicit; this is not real OAuth or provider evidence. Hosted CI 35630343181 passed at 5246869. Manual retry, reconciliation and real Scalar execution remain incomplete.

## Phase 01 request-origin repair — 2026-09-21

The mutation sweep found ten endpoints without an Origin check. All twelve browser mutation endpoints now use one shared guard, with exact scheme/host/port checks before authentication. Real HTTP testing found and repaired a Next proxy internal-host normalization mismatch. All 54 automated tests, typecheck, lint and production build pass; all twelve HTTP endpoints reject missing/foreign origin and reach authentication for a valid origin. No real OAuth session was available. Prior Applications diagnostics commit 4e71af9 passed hosted CI run 35630879094. Phase 01 remains In progress pending real Convex OAuth and authenticated tenant workflows.

## Hosted PostgreSQL kernel — 2026-09-21

Created dedicated free-plan Neon project `company-humans` (`twilight-butterfly-74677439`, PostgreSQL 17, AWS us-east-1, 0.25 CU). All 21 unchanged migrations and seven product seeds passed first on isolated branch `verification-phase01`; all 11 database integration tests passed there using restricted logins. Production accepted the same migrations/seed, and migration replay applied zero changes. Production contains zero users and organizations.

Three separate pooled production logins connected successfully: read, service and identity. Each has only its corresponding application role and no superuser, database creation, role creation or RLS bypass capability. Tenant tables have RLS enabled; runtime logins are not their owners. Credentials remain in ignored mode-0600 files. No production worker credential is provisioned. The web deployment has not been wired to these credentials.

Hosted PostgreSQL exposed a version-16+ role ownership migration issue, repaired through transaction-local SET-role self-grant without changing migration checksums. The full local 54 tests, typecheck, lint and production build pass after this repair. Actual OAuth and authenticated browser workflows remain outstanding; Phase 01 is In progress.

## Hosted web foundation — 2026-09-21

Vercel deployment `dpl_DtYyNSrWRG4KzC83TFyWYQ8WQWLS` reached READY and was promoted to https://company-humans.vercel.app. Application source is `8d72e92` plus explicit upload exclusions. Hosted install/build succeeded. Health returned 200 with the expected revision; anonymous identity and same-origin organization creation returned 401. Browser inspection verified home → workspace selection → sign-in navigation and the honest unconfigured-provider state. Convex SITE_URL matches the stable origin.

Three restricted production database variables are sensitive in Vercel; the migration credential was not uploaded. Deployment dry-run verification proved environment files and reference material excluded before any upload. Real OAuth and authenticated database operations remain unverified. No contributor or ecosystem-access acceptance is claimed.

## Invitation review and revocation — 2026-09-21

People now links to a dedicated, paginated invitation history with expiry and state. Authorized admins can revoke pending invitations after confirmation; admin-role invitations remain owner-controlled. Revocation locks the same row as acceptance, updates status and audit atomically, and is idempotent without duplicate audit entries. Token hashes and bearer links are excluded from history.

Verified: 56 automated tests, 22 desktop/mobile component checks, full typecheck/lint/build, and the new restricted-login security scenario on hosted verification PostgreSQL. Browser fixtures remain separate from actual OAuth. CH-10 and Phase 01 remain In progress until real login and authenticated lifecycle acceptance.

## Product membership mapping prerequisite — 2026-09-21

Added canonical product-membership IDs, migration 0022 and an idempotent audited server request boundary. Tenant composite references and RLS block cross-organization mapping; runtime credentials cannot fabricate provider success. Product-member operations and usable access remain unimplemented. This independent prerequisite does not waive Phase 01 OAuth or CH-17 real Scalar acceptance.

Verified for this increment: all 57 automated tests, typecheck, lint and production build pass. The restricted-login mapping scenario also passed on the hosted verification branch before migration 0022 was applied to production and local development. No product-member API or live adapter is exposed by this increment.

## Member offboarding command persistence — 2026-09-21

Added immutable, revisioned product-member commands. New mapping intent records provisionMember; workspace suspension/removal disables mappings and records suspendMember/removeMember with audit in one transaction. Member admins do not need application configuration privileges to deny access. Reactivation/reinvitation does not resurrect old mappings. A shared transaction lock closes the insert-versus-suspension race without broadening owner mutation privileges.

Verified: 58 automated tests, typecheck, lint and build. Both mapping/offboarding security scenarios pass on hosted verification PostgreSQL; migrations 0023–0024 then applied to development and production. No UI changed. Commands await an actual dispatcher and provider receipt; real Scalar suspension/removal and OAuth acceptance remain unverified.

## Application disable prerequisite — 2026-09-21

Implemented the server/database boundary for idempotent product disable, atomic member suspension commands and audit, and mapping-insert fencing against concurrent disable. Provider status is unchanged; runtime credentials cannot fabricate it or automatically re-enable disabled instances. The original pending-only update policy failed the first active-instance test and was repaired through a new migration.

Verified: 59 automated tests, typecheck, lint, build and the new hosted verification PostgreSQL scenario pass. Migrations 0025–0026 then applied to development and production. Hosted sign-in still reports unavailable providers. No public disable UI/API or remote suspension was added; member dispatch, reconciled restore and real Scalar acceptance remain outstanding. Phase 01 and Phase 02 gates remain incomplete.

## Applications disable UI/API — 2026-09-21

The Applications page now offers a confirmed disable action using inherited controls. The new POST binds the canonical actor on the server, enforces same-origin and tenant/capability checks, and returns accepted local intent without claiming remote revocation. Error/retry and busy states are covered; successful local denial is reflected immediately. The UI states remote access is unconfirmed and restoring access is not yet available.

Verified: 68 automated tests, 24 explicit-fixture desktop/mobile checks, typecheck, lint and build pass. Live local HTTP checks prove origin denial and fail-closed unavailable identity. Actual OAuth and Scalar suspension remain unverified. Prior commit f834c37 passed hosted CI 35637451563; current increment is not yet production acceptance.

## Restricted member denial execution — 2026-09-21

Added product-bound suspend/remove dispatch under a dedicated restricted worker role, tenant-scoped job leases, five-attempt retry ceiling, stable provider keys, immutable completed attempts, validated receipts and superseded-revision handling. Previously authorized cleanup continues after the initiating member is suspended. The worker cannot grant access or alter identity/mapping provider state.

Verified: all 69 automated tests, typecheck, lint and build; the new multi-case restricted-credential scenario also passed on hosted verification PostgreSQL. Migration 0027 then applied to development and production. Prior UI/API commit 76a6c52 passed hosted CI. No UI changed. No production worker login/scheduler, real Scalar call or provider-state projection is installed; provider-aware reconciliation, provision/resume/entitlements and real OAuth remain outstanding.

## Application member diagnostics — 2026-09-21

Added a dedicated per-application member-access page linked from Applications. It shows desired access, current-revision denial progress and attempt history without exposing provider references or leases. Empty, restricted and unavailable states and pagination are explicit. No action or job status grants access or claims unobserved revocation.

Verified: 69 automated tests, 28 fixture-backed desktop/mobile checks, typecheck, lint and build. The extended authorization/projection scenario also passes on hosted verification PostgreSQL. Previous worker commit 2a8efa9 passed CI 35638862793. Updated connection checks leave Symbolic discovery broken and Scalar waiting for native account sign-in; actual application OAuth/provider gates remain incomplete.

## Service-attributed adapter audit — 2026-09-21

Reviewing canonical documents 03/05 identified the missing central audit events for denial-worker execution. Claims, normalized receipts and terminal transitions now record the service actor atomically with the worker transaction. Existing human identity remains intact, envelope/row actor identities must agree, and worker policies prohibit human/other-service impersonation. Audit UI distinguishes human and service actors.

Verified: all 69 automated tests, typecheck, lint and build; the extended security/rollback scenario passes on hosted verification PostgreSQL. Migration 0028 then applied to development and production. Prior diagnostics commit 1fc874a passed CI 35639494679. Scalar's latest native login expired without callback and its stale tab was closed. No real OAuth, provider execution or entitlement grant acceptance is claimed.

## Remaining-plan refresh — 2026-09-21

Rechecked the canonical Notion roadmap, current git state and successful CI at 84653c1. Updated the remaining plan to credit completed disable/denial execution and diagnostics while preserving live OAuth and Scalar gates. Entitlement contracts, migration 0029 and configuration code remain uncommitted and unverified; they are excluded from completion counts. No phase or Notion task was marked complete.

## Versioned entitlement configuration — 2026-09-21

Implemented organization defaults/member overrides, canonical entitlement IDs, explicit deny precedence, optimistic revision conflicts, append-only history and atomic human audit. Migration 0029 enforces tenant references, RLS and consecutive revision numbers. This is configuration intent only; no UI/API, effective resolver, provider grant or usage enforcement is claimed.

Verified: 72 automated tests (11 contracts, 17 database, 44 web), typecheck, lint and production build. The restricted-role scenario also passes on hosted verification PostgreSQL, including concurrent edits, foreign tenant denial, immutable history, retired/invalid/unknown capability rejection and rollback on audit failure. Migration 0029 then applied to production and local development. No UI changed. CH-18 and Phase 02 remain incomplete pending actual Scalar enforcement; Phase 01 OAuth acceptance remains outstanding.

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

## Live connection recheck and member bootstrap review — 2026-09-21

Symbolic's updated endpoint now advertises OAuth (connection check 19:06:20 UTC), resolving the earlier missing-challenge failure. Native authorization launched and reached the Google account chooser; all displayed accounts were signed out. User sign-in and authenticated tool/read verification remain required. No Context Compiler or Flow execution is claimed.

Reviewed canonical provisioning document 05 against the actual V1 interface and documented the initial-member-access gap before implementing remote grants. The required next proof is remote default denial until current entitlements and finite budgets are acknowledged. See [assessment](member-provisioning-control-gap.md). Existing entitlement UI is unchanged.

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

## Suspended member bootstrap executor — 2026-09-21

Implemented a restricted V2 provisionMember dispatcher with tenant/product scope, explicit suspended creation, two-minute leases, stable provider keys, five-attempt retry ceiling, immutable attempts and atomic service audit. Claims and receipts recheck current desired revision and active target identity/product state. Superseded receipts are retained for reconciliation. General application credentials cannot run it, and the worker cannot activate product mappings or edit identity.

All 114 automated tests, typecheck, lint and production build pass. No real provider adapter, hosted worker credential/scheduler, entitlement/limit application, provider-state projection, readback, resume or launch access is installed. CH-17 and Phase 02 remain incomplete; Phase 01 real OAuth remains unverified.

The bootstrap scenario also passed on the isolated hosted verification database (32.49 seconds). Migration 0030 then applied to local development and hosted production; production replay applied no changes. Both local databases and both hosted databases now have 30 migrations. No production fixture records, execution login or scheduler were created.

## Suspended provider identity binding — 2026-09-21

The bootstrap worker now binds a successful current suspended receipt to the canonical product membership through migration 0031's restricted function. The mapping records external identity, suspended status, receipt provenance and timestamp; an atomic service audit records the binding without leaking provider identity. The function cannot activate access, replace an existing different remote identity, bind a duplicate identity in one instance or project superseded work. Collisions preserve receipts for reconciliation.

All 114 automated tests, typecheck, lint and production build pass. Effective entitlements/finite limits, provider readback, activation, hosted workers, real Scalar transport and real OAuth remain unverified. No later phase is marked complete.

The extended restricted-login binding scenario also passed on hosted verification PostgreSQL (36.74 seconds). Migration 0031 then applied to development and production; production replay applied zero changes. All four databases now have 31 migrations. Prior worker commit 293d2d1 passed hosted CI run 35645244935. No provider or production authenticated journey is claimed.

## Finite product/member limit configuration — 2026-09-21

Implemented canonical usage-limit IDs/contracts, migration 0032 and a budgets.manage server write boundary. Product-instance/member limits specify catalog meter, immutable unit, UTC window and exact nonnegative quantity; zero stops and unlimited values are rejected. Revisions and audit append atomically, concurrent edits conflict, and tenant references/RLS protect history. Existing unknown/retired meters may still be reduced to zero.

All 117 automated tests, typecheck, lint and production build pass. The adapter unit/window/revision gap was documented before any provider interpretation. No limit UI/API, metering, effective hierarchy, policy application/readback, activation or real Scalar enforcement is claimed. CH-18 and Phase 02 remain incomplete; the Phase 03 budget engine is not complete.

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

## CH-15 receipt retention after revocation — 2026-09-21

Completed the previously uncommitted recovery change. Restricted organization provisioning retains a valid in-flight provider result after human revocation, instance disable or catalog retirement, refuses activation and marks the operation for reconciliation. It enforces the original initiating-user fence and audits execution as service organization-provisioner. Actual provider outcomes/references remain immutable attempt history.

All 166 automated tests, typecheck, lint and production build pass; both final affected scenarios passed hosted verification (49.86 seconds combined). Migration 0036 is applied to local development/verification and hosted verification/production, with production replay unchanged. This is fixture-backed generic orchestration, not live Scalar acceptance. Remote cleanup/reconciliation, production workers, OAuth and remaining phase gates are still incomplete.

## CH-15 direct SQL initiating authority — 2026-09-21

A regression reproduced substitution of another authorized administrator at the privileged SQL activation boundary after the original claimant was suspended. Migration 0037 now requires the original actor on the matching unfinished attempt for both create and connect activation. It preserves existing current-permission, lease, target and instance checks; the limited function owner has scoped attempt reads only.

All 167 automated tests, typecheck, lint and build pass. Three affected scenarios passed hosted verification (59.80 seconds combined); migration 0037 is applied to all four databases. Prior a2f4f24 passed CI 35653397715. This security repair does not establish real OAuth, Scalar transport, hosted workers or full Phase 02 acceptance.

## CH-18 capability staging prerequisite — 2026-09-21

Implemented deterministic desired-capability snapshot resolution and the additive V2 capability staging/readback extension. Resolution rejects mixed scopes/ambiguous revisions, applies deny precedence and excludes retired catalog capabilities. Staging requires complete-set replacement, canonical/external identity agreement, policy revision and continued suspension; comparison rejects excess, missing or mismatched grants.

All 173 automated tests, typecheck, lint and build pass. This is a shared contract prerequisite only: durable snapshot issuance, execution worker, effective runtime policy gates, Scalar transport and activation remain unimplemented. No provider acceptance, migration or hosted execution is claimed. CH-18 remains incomplete. Prior cdbf42f passed CI 35653785919.

## CH-18 durable capability snapshots — 2026-09-21

Added server-only preparation of complete requested capability snapshots for bound suspended members. Per-member revision issuance is serialized; unchanged sources reuse a revision; changed source policies/catalog create immutable history with target, desired revision, actor and atomic audit provenance. Tenant RLS, composite references, direct revision-sequence checks and runtime mutation denial protect storage.

All 174 automated tests, typecheck, lint and build pass; the restricted-service scenario passed hosted verification (11.60 seconds). Migration 0038 is applied to all four databases with production replay unchanged. Provider calls are absent. Worker dispatch, automatic freshness/reconciliation, full effective runtime policy and actual Scalar enforcement remain incomplete. Snapshot preparation does not enable access.

## CH-18 restricted capability staging execution — 2026-09-21

Migration 0039 atomically enqueues snapshots and adds durable job/attempt history plus a separate restricted capability worker role. The dispatcher applies the complete set and independently reads back suspended capability state, using stable retries, bounded deadlines and atomic service audit. It recomputes current canonical source configuration at claim/completion and supersedes stale work, preserving historical receipts. It cannot resume a member or change preferences.

All 175 automated tests, typecheck, lint and build pass. Both affected scenarios passed hosted verification (55.31 seconds combined). All four databases have migration 0039; production replay made no changes. Real Scalar transport, hosted execution, automatic snapshot refresh/reconciliation, administration diagnostics and final effective-policy activation remain incomplete. Fixture readback is not provider acceptance.

## CH-18 capability delivery diagnostics — 2026-09-21

Member access settings now show latest snapshot revision, freshness against current source/eligibility, job status and bounded attempt history. Strict server projections exclude provider identities, leases, raw receipts and worker credentials. Saving preferences clears prior success locally while waiting for refreshed status. Existing usage-limit delivery presentation is shared without changing enforcement behavior.

All 175 automated tests, typecheck, lint, build and 68 fixture browser checks pass; desktop/mobile screenshots were reviewed. The expanded restricted-role scenario passed hosted PostgreSQL (48.44 seconds). No migration was required. Real OAuth, Scalar transport/enforcement, hosted workers, automatic refresh/reconciliation and final activation remain incomplete.

## CH-18 bounded background snapshot refresh — 2026-09-21

A separate restricted capability-preparer now scans bound suspended mappings in keyset pages of up to 50, recomputes current sources and atomically appends changed snapshots, queues staging and records service audit. Unchanged scans are idempotent. It does not depend on a live initiating admin and cannot edit preferences, grants or provider outcomes. A scheduler must finish each cursor chain and restart from null; no hosted scheduler or credential is configured.

All 176 automated tests, typecheck, lint and build pass. Both affected preparation scenarios passed hosted PostgreSQL (29.14 seconds combined). Migration 0040 is applied to all four databases with clean production replay. Live provider acceptance, active-member policy refresh/reconciliation and final activation remain incomplete.

## Scalar provider source audit — 2026-09-21

Read-only review of Scalar main at f773ee94e32406c93b6d51dd408aa40e51938975 found concrete missing sponsored-control guarantees: suspended membership state, verified Convex-to-Scalar identity/launch, revisioned capability and hierarchical-limit enforcement, pre-cost reservations and durable actor-attributed usage. See [source evidence and required provider work](scalar-control-assessment.md). Current pooled credits and Clerk membership mirrors do not satisfy these guarantees. No provider mutation or live acceptance was performed; Phase 02/03 remain open. The next independent application task is the authorized connect-existing intent UI, without claiming ownership or access from an external ID.

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
