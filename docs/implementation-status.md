# Implementation status

Updated 2026-09-22. Destination: `mosnin/company-humans`, branch `codex/company-human-foundation`, [draft PR 1](https://github.com/mosnin/company-humans/pull/1). Company OS remains unchanged.

Current remaining work and acceptance gates: [remaining phased build plan](remaining-build-plan.md), refreshed against the canonical Notion roadmap; subsequent health-page and isolated-runtime delivery evidence is recorded below. Historical sections below retain their original evidence counts and deployment state.

## Verified locally

- Shared canonical IDs, signed event/audit contracts, migration checksums, deterministic product seeds, and versioned adapter interface.
- A restricted test service creates real canonical users, organization and membership, then signs a shared event; changing its tenant invalidates the signature.
- Identity synchronization, tenant isolation, stored capabilities, audited permission changes, invitation lifecycle, team scope, and append-only runtime audit permissions.
- Direct contributor SQL cannot promote itself, change the organization, become a team manager, grant permissions, or activate a product.
- People, Teams, Permissions, and Audit pages use scoped services. The shell generalizes Company OS's header, rail, canvas, form, and table design.
- Invitation acceptance requires the authenticated Convex OAuth profile's verified email. The token survives sign-in across same-origin tabs with a 30-minute application expiry and clears on acceptance/sign-out.
- Google and email magic-link authentication replace GitHub. Library lifecycle, token replay/expiry, cross-tab invite return and request limits have local verification; actual provider credentials and authenticated acceptance remain outstanding.
- Signed usage ingestion, exact scoped aggregation and audited quarantine recovery have local database and HTTP evidence. CI at ec564ab passed in run35747591915:308 automated tests,84 fixture browser checks,4 real anonymous runtime checks and actual signed HTTP/database concurrency verification. Detailed counts below are dated checkpoints.
- Migrations through0067 are applied on hosted verification and production. Request eligibility, access readers and bootstrap worker source are deployed on the production web, but no hosted bootstrap scheduler or live adapter is configured. Seven reference products remain catalog entries, not live integrations. Restricted credentials stay in ignored environment files.


## Phase gates

| Phase | Status | Remaining acceptance |
| --- | --- | --- |
| Source scaffold | Implemented; local checks pass | Live authenticated layout and deployment verification. |
| 00 Foundation | Verified at 3fbc494 | Public GitHub run 35522115426 passed install, typecheck, lint, migrations, seed, tests, build and browser checks. |
| 01 Identity kernel | In progress | Real Convex OAuth sign-in/sign-out, browser create/invite/accept/assign/switch/suspend scenario, and acceptance of the latest deployed revision. Restricted web credentials are configured. |
| 02 Provisioning | In progress | Real Scalar adapter, fenced activation/denial orchestration, hosted workers and full lifecycle proof. Suspended bootstrap, policy staging/readback and health administration have local coverage. Mapping and pending intent grant no access. |
| 03 Metering and billing | In progress; independent preparation | Signed storage/API, scoped aggregation and quarantine recovery implemented locally. Real Scalar emission, durable billing windows, budgets, hard stops, valuation and billing remain open. |
| 04 Human workspace | Not started | Contributor Work, Context, Earnings, Leaderboard, Team and manager workflows. Apps assignment visibility exists, but does not yet launch real sponsored access. |
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

1. **Convex deployed; Google/email setup remains:** dedicated free-plan project `company-humans` / production `sensible-dinosaur-165` is deployed. Signing keys, anonymous identity denial, discovery and JWKS were verified. Independent local Convex development bypasses the cloud development quota. Google Cloud first-use terms/project selection and a Company Human email sender remain unresolved. No GitHub provider is enabled. See [authentication setup](authentication.md).
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

## Contributor authentication correction — 2026-09-22

User direction: Google and email magic links replace GitHub sign-in. GitHub is removed from provider registration and UI allowlisting. Convex remains the session authority. Email is delivered through Resend with AUTH_RESEND_KEY and AUTH_EMAIL_FROM on the dedicated Convex deployment; Google needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET. AUTH_ENABLED_PROVIDERS=google,email is enabled on the web deployment only after the corresponding provider configuration is verified.

Magic links expire after 15 minutes, preserve the invitation return route, and open an email confirmation page before token redemption. The custom identity callback permits an unverified email account at request time but only stamps verification after token redemption. It never merges Google and email accounts by matching email. Google and email using the same address remain separate identities pending an explicit secure linking flow.

Production delivery, Google consent, token replay/expiry in the running backend, and the authenticated workspace/invitation journey remain unverified. No provider credentials were fabricated or copied from another product.

Validation: 157 web tests passed, repository typecheck/lint and production build passed. Actual Chromium against the production build displayed the email confirmation and rejected a missing token without page errors. This does not verify real email delivery or Google consent.

Email authentication follow-up: full library lifecycle coverage and transactional send limits are implemented. 163 web tests pass. Production Google/email configuration and the live authenticated workspace journey remain open; the connected Resend account currently only has alerts.usechippi.com verified, and no Company Human sender has been selected.

Cross-tab invitation return is implemented with a 30-minute application expiry and clearing on acceptance/sign-out. The updated Google/email browser suite passes all 84 cases with two workers; typecheck, lint and production build pass. A first five-worker local run had two unrelated mobile interaction failures that passed in the full two-worker rerun; these are not presented as provider acceptance.

### Production deployment checkpoint — 2026-09-22

Convex production sensible-dinosaur-165 received the Google/email implementation and authEmailRequestLimits index. Vercel deployment dpl_5LCijBopFrSPLAZyDL3TZsYPq1sp is READY and aliased to https://company-humans.vercel.app; its live /api/health reports c8319981967059ccdc9293ddfa923b8e3eef2a94. Live anonymous Chromium confirmed unavailable providers, no GitHub button, email confirmation rendering and rejection of a missing token without page errors. /api/organizations returned 401 and the Convex identity query returned null. Google consent and real email delivery remain unverified. CI 35691705991 was still running when this checkpoint was recorded.

CH-20 preparation is in progress under the user's direction to continue independent work despite provider blockers: canonical meter/event contracts, migration 0044 and signed idempotent storage are implemented. This does not mark Phase 03 or CH-20 complete. Public ingestion/key management, quarantine resolution, aggregates, hard stops and actual Scalar usage are still required.

CH-20 endpoint: POST /api/usage/events now verifies signed service events against operator-configured scoped credentials and uses the restricted ingestion transaction. No live credentials are provisioned. Real Scalar emission, quarantine recovery and production acceptance remain open; later billing, budget and reporting features are not claimed.

### Usage aggregation preparation — 2026-09-22

CH-21 has an implemented, locally tested read projection and authenticated endpoint. It aggregates exact quantities across explicit occurrence windows with own/team/all RLS and preserves product/meter/version/unit boundaries. Migration0045 is applied only to local security verification. Durable billing windows, real Scalar emission, quarantine recovery and budget enforcement remain open. Phase03 remains in progress, with Phase01/02 provider acceptance still open. Notion write access is unavailable; no tracker task was marked Done.

Usage ingestion provenance correction is locally verified: human identity is tied to canonical historical membership by database constraints; foreign attribution and parser bypass fail. Actual HTTP/Next/restricted-PostgreSQL concurrent retry verification passed using a disposable test database. Migration0046 remains local verification only. No live Scalar activity or financial billing acceptance is claimed.

Quarantine recovery is implemented and locally verified through restricted database integration and authenticated endpoint tests. It preserves immutable source history and releases one accounting input after exact meter registration. Migration0047 is local verification only at this checkpoint. CH20/21 and Phase03 remain open for real provider flow, durable windows and downstream budgets/billing.

Phase02 activation prerequisite: additive fenced member access contract and reusable conformance runner implemented and locally reviewed/tested. The contract prevents safe activation from being represented by legacy resume alone. Durable activation/reconciliation worker and real Scalar implementation remain unimplemented; no remote access was granted.

### Metering hosted verification and scope sweep — 2026-09-22

CI35747591915 passed at ec564ab, including the new actual HTTP concurrency verification. Hosted verification applied0044–0047 and passed signed ingestion, scoped aggregation and quarantine recovery integration tests. Production applied those four migrations from an immutable snapshot of committed ec564ab. An earlier combined attempt encountered an uncommitted0048 trigger-ownership ordering error and rolled back its entire transaction; no partial production schema was left behind. Only the committed metering snapshot was then released. New0048 remains a separate local provisioning task.

Product-scope review found no unrelated tracked copied screens/assets or obsolete contributor authentication imports. Corrected current Google/email setup instructions, health UI documentation, landing claims and contributor home links. Historical dated evidence remains intact; unfinished work, CRM and earnings are not presented as available features.

### Dedicated usage page — 2026-09-22

/workspace/usage now exposes permitted actual consumption with product/meter labels, exact quantities and UTC period/environment filters. It reuses inherited PageHeader/Card/Button/shell primitives. Role-aware navigation includes Usage and fixes Teams visibility for assigned-team managers. Server/page/navigation and12 desktop/mobile fixture checks pass; root inspected mobile rendering and repository typecheck/lint/build passed. Production OAuth remains unconfigured, so this is not an authenticated hosted acceptance claim.

### Fenced denial orchestration — 2026-09-22

Migration0048 and dispatcher integrate the existing lifecycle API denial intent with a shared monotonic access journal and existing durable jobs. Legacy provider methods cannot dispatch through this path. Receipt/readback, final binding validation and visible reconciliation failures are locally verified and independently reviewed. Localdevelopment/securityverification contain0048; hosted rollout is pending. The original empty development0048 journal was reset before release to correct trigger-creation ordering for non-superuser migration owners; no production0048 was applied. Activation, late-bootstrap recovery, real providers and hosted scheduling remain open.

### Canonical identity offboarding — 2026-09-22

0049–0050 implement atomic deletion→product-denial intent with service provenance, user/mapping serialization and historical tombstone reconciliation. Local database tests and independent review pass; full338-test suite, typecheck, lint and build pass. No hosted offboarding migration or provider revocation is claimed at this checkpoint. Convex deletion delivery, global suspension semantics and real remote execution remain open.

### Production and immutable migration release — 2026-09-22

Production deployment dpl_3vBnRRDPd4k1DXkV9bEUeDBE3VaL is READY at fe45da6682c005f5c14988a5b0efed76ba775f62. The live health endpoint reports that exact revision; mobile Chromium verified the corrected landing page, anonymous Usage redirect, no GitHub sign-in, and no page errors. Anonymous organization/aggregate requests and unsigned usage ingestion return401. CI run35751516447 passed at the same revision. Real Google/email sign-in remains unverified.

Hosted verification and production applied committed migrations0048–0050. Nine hosted denial, offboarding, bootstrap and product lifecycle tests passed with network-appropriate60-second test/hook timeouts. A restricted production usage-ingestion login is configured in Vercel; no provider signing credentials or real Scalar event acceptance are claimed.

`scripts/migrate-release.mjs` executes SQL and the matching migration runner from one immutable committed revision, excluding concurrent unfinished working-tree migrations. Replay of fe45da6 against hosted verification applied no changes. Repository-local Git author email now resolves to the authenticated GitHub owner; a subsequent production deployment succeeded without rewriting history.

### Policy invalidation and contributor access state — 2026-09-22

0051–0053 add atomic entitlement/limit access invalidation, full fenced denial readback projection, current target product.use checks, and an honest contributor pending-access state. Bound assignments retain desired intent; they cannot become usable from these changes. Provider failures/disconnection remain visible before pending changes. Independent review accepted the final state after correcting unavailable-state precedence. Local integration covers concurrent policy edits, immutable provenance, audit rollback, foreign tenant denial and stale/forged receipt rejection.

Hosted verification and production now contain0051–0053 from immutable committed source. Five targeted hosted tests passed; the policy test required removing an unnecessary DROP OWNED cleanup step for the non-superuser hosted role. The successful retry took23.18 seconds. Activation, comprehensive role/team/org/catalog invalidation, hosted worker dispatch and actual Scalar lifecycle acceptance remain open.

0051–0053 final local verification:340 automated tests passed (70 contracts,35 PostgreSQL,235 web), followed by repository typecheck, lint and production build. Full-suite cleanup and old desired-disable assertions were corrected to match retained audit records and honest pending state. Independent review accepted tenant grants, provenance, exact receipt projection and UI precedence. Hosted and real-provider acceptance remain separate.

### Production policy release — 2026-09-22

Deployment dpl_6QSNumgNK1jZmxnqajteCG5Fn29R is READY at072691414ac89085661ba5023e17a7b2b924316a, aliased to company-humans.vercel.app. Live health reports that exact revision. Mobile Chromium verified anonymous Apps redirects to sign-in, no GitHub button, no horizontal overflow and no page errors; organization and usage endpoints deny anonymous access. Screenshot is a local QA artifact. Real OAuth and Scalar access remain unverified. CI35753046050 passed at preceding policy implementation a69d29c.

### Authorization loss and historical reconciliation — 2026-09-22

0054–0055 implement atomic product.use loss/reassignment denial and owner-only reconciliation of existing unauthorized bound assignments. They preserve desired assignment and role truth, retain immutable source_authorization provenance, and require current fenced readback. Local real-transaction tests observe both role-change/revocation lock orderings and verify tenant denial, audit rollback, forged provenance denial, stale receipts and idempotent recovery. All55 migrations replayed successfully on a fresh disposable database. Full-root verification passed341 tests (70 contracts,36 PostgreSQL,235 web), typecheck, lint and production build. Hosted rollout remains pending at this checkpoint.

Independent review accepted0054–0055: new-transition and historical reconciliation paths preserve authorization truth, use restricted provenance and the shared fence, reject forged/runtime calls, and remain idempotent. No actual provider activation or revocation is inferred.

0054–0055 hosted verification applied the exact committed cd3e114 migrations and passed three permission/capability integration tests in54.21 seconds. The browser fallback for Notion also requires sign-in to Mosnin's Notion; no tracker write was made. Canonical captured requirements remain the implementation authority.

### Catalog permission staging — 2026-09-22

0056 adds narrow global permission-catalog reads to the restricted capability preparer and worker. The shared source reader requires the target member to hold every catalog requirement and product.use within the current organization; unknown requirements deny preparation. The requirement set is part of the source fingerprint. Local migration and two focused PostgreSQL tests pass, including a target contributor lacking an owner-held requirement and an unknown requirement. Positive member limits and remote denial on loss of an additional requirement are still outstanding; no activation claim is made.

### Positive member-limit authorization — 2026-09-22

0057 locally adds the target-role permission predicate and claimed access revision fence to positive member-limit attempts. Real PostgreSQL tests prove an older receipt is superseded after product.use revocation and restoration, and that removing another catalog requirement during the call supersedes the receipt. Zero hard stops and aggregate organization limits remain deliverable. This is worker delivery safety, not proof of real provider enforcement or member activation.

### Organization status denial — 2026-09-22

0058–0059 implement durable fenced denial for active-to-inactive organization transitions and private historical reconciliation. Assignments stay desired; remote state is only confirmed by exact provider receipts. Local test covers foreign tenant isolation, audit rollback, a failed compact receipt and no restoration on reactivation. The migration owner fixture changes status because the general service guard intentionally forbids it; no user-facing organization suspension API or live Scalar provider action is claimed. A fresh59-migration replay and full342 automated tests passed locally, and repository typecheck, lint and production build passed.

Hosted verification and production applied committed 0058–0059 from `5d918be`; the targeted hosted organization test passed. This is schema and restricted-worker verification, not proof of live provider suspension.

### Product catalog access invalidation — 2026-09-22

0060 makes access-relevant catalog status or metadata changes atomically block provider-bound, desired member mappings for that product across organizations. Display name, description and deep-link edits do not create denials. The migration records service and catalog provenance, increments the existing desired/access revision stream and queues the existing fenced denial job. It also reconciles bound access for products already retired or in draft. Compact worker receipts cannot confirm these catalog denials. Assignment intent remains and restoration does not resume access.

Local verification: all 60 migrations replayed on a fresh disposable PostgreSQL database and the catalog integration passed. The older policy test was updated because product retirement now creates an additional access revision. A pre-review version also passed 343 tests; the reviewed migration and test were rerun with 0061 in the full gate below. Hosted migration, CI and real provider denial remain separate gates.

0061 closes the pending suspended-member binding race using a product access-contract revision stamped onto each provisioning command. Catalog updates and binding share a database advisory lock; a stale or legacy unstamped provision command can still retain its suspended provider identity, but its exact mapping is immediately blocked and queued for fenced denial in the same transaction. Draft products reject new binding. A bind-time audit failure rolls back the binding and denial together. No runtime role received product UPDATE authority. This covers catalog changes, not yet role-permission loss during pending binding.

Root verification on a fresh seeded disposable PostgreSQL database: all 61 migrations replayed, 344 automated tests passed (70 contracts, 39 database, 235 web), root typecheck, lint and production build passed. The concurrency test observed the binder waiting on the catalog advisory lock before the catalog transaction committed. The old bootstrap fixture now creates its own ready product rather than binding against the draft Scalar seed. Hosted verification, production migration, CI and real provider denial remain separate gates. Revocation of an additional catalog-required role permission is the next identified invalidation gap; product activation remains disabled.

The first immutable hosted verification attempt at `ea957f7` rolled back both 0060–0061: its non-superuser migration login could not replace the binding function owned by the dedicated non-login role. The unapplied 0061 source now temporarily grants schema CREATE, switches to that exact function owner for replacement, then revokes CREATE. A fresh 61-migration replay, full 344 tests, typecheck, lint and build pass with the corrected source. No hosted or production schema change is claimed from the failed attempt.

Corrected committed revision `12b1a01` applied 0060–0061 to hosted verification. Four focused hosted PostgreSQL integrations passed in 90.73 seconds with network-appropriate timeouts, including catalog invalidation, pending-binding concurrency, bootstrap, and policy access. The same immutable migration revision then applied 0060–0061 to production. No integration fixtures or live provider calls were run on production. [CI run 35799492335](https://github.com/mosnin/company-humans/actions/runs/35799492335) passed clean install, migration replay, seed, all tests, typecheck, lint, browser checks, production-build anonymous runtime and signed-usage HTTP verification. Production web remains on its previously reported deployment SHA; no live Scalar denial or OAuth sign-in is claimed.

### Required catalog permission loss and ready-state eligibility — 2026-09-22

0062 generalizes authorization invalidation from `product.use` to every registered catalog-required permission. The shared tenant-scoped database predicate fails closed for malformed or unknown requirements. Grant loss or denying role reassignment blocks bound desired members, increments the existing access fence, and writes one durable denial and audit per mapping in a transaction. Both sides of a cross-organization grant move acquire ordered tenant locks. A pending suspended provider identity is retained but blocked during binding if a requirement is now missing. Historical unauthorized bound assignments reconcile idempotently; restoring a grant does not restore access.

Capability preparation now excludes blocked members and requires a ready catalog entry. New member bootstrap claims and positive member-limit delivery also require ready; zero hard stops remain deliverable. Contributor Apps and admin configuration projections mark draft products unavailable. These checks do not grant or activate access.

Fresh disposable PostgreSQL replayed and seeded all 62 migrations. The complete local suite passed 345 tests (70 contracts, 40 database, 235 web), followed by typecheck, lint and production build. The database test observed an actual authorization-lock wait during pending binding, selective denial across products and tenants, exact fenced receipt behavior, audit rollback, malformed metadata denial and historical idempotency. Provider interactions are fixtures. Hosted migration, CI, production web/schema release and real provider behavior remain separate gates.

Hosted verification applied 0062 from committed `27c3845`. Six of seven focused hosted integrations passed; the new test failed because its migration-login fixture called a private function without the binding role. The function's permission boundary was correct. The test was corrected and passed from immutable `73caa23`; its local fresh-database replay and typecheck passed too. [CI run 35801107594](https://github.com/mosnin/company-humans/actions/runs/35801107594) passed clean migration/seed, all tests, typecheck, lint, browser checks, production-build anonymous runtime and signed HTTP usage verification.

Production applied 0062 from immutable `73caa23`; no integration fixtures were run there. Vercel production deployment `dpl_2AwQgqQNMaRBtF4egDYXxVGKyzBn` is READY and aliased to https://company-humans.vercel.app. The live health endpoint reports exact revision `73caa2354702dd02add502b132906eddeae7a3ec`; anonymous organizations and unsigned JSON usage requests return 401, while workspace Apps redirects to sign-in. An initial CLI deployment of the same checkout had null health revision because Git metadata was not injected; the final deployment supplies an explicit per-deployment runtime revision. Real Google/email sign-in, Scalar provider denial and sponsored access remain unverified.

### Bootstrap authorization before provider work — 2026-09-22

0063 exposes a tenant-bound permission wrapper and a narrow role-id read to the restricted bootstrap worker. The worker now requires a ready product, unblocked mapping and all target role permissions before creating a provider identity and again before accepting a provider result. A disallowed in-flight result is recorded as superseded with its provider reference but is not bound to the member. An unauthorized pending command remains inert; cleanup of a late remote identity and real provider execution still require separate work.

The focused local PostgreSQL test verifies zero provider calls after pre-claim revocation or policy block, in-flight revocation supersession, cross-tenant isolation, catalog requirement changes, no automatic resume, wrapper tenant denial and raw-function non-executability. A fresh database replayed and seeded all 63 migrations; all 346 tests passed (70 contracts, 41 database, 235 web), as did repository typecheck, lint and production build. Hosted/production release and real provider reconciliation are separate gates.

The first immutable hosted migration attempt at `1287cd6` rolled back because the migration login could not revoke a grant it did not own on the shared private predicate. That grant was never present for the bootstrap role; the unapplied `0063` statement was removed and all 346 tests passed again on a fresh database. Corrected committed `89813dd` applied 0063 to hosted verification, and four focused hosted PostgreSQL integrations passed in 108.36 seconds. [CI run 35802166423](https://github.com/mosnin/company-humans/actions/runs/35802166423) passed clean migration/seed, all tests, typecheck, lint, browser, anonymous runtime and signed HTTP usage checks.

Production applied 0063 from immutable `89813dd`; no integration fixtures ran there. Vercel deployment `dpl_25nSrbJTbyW9CMiSiXTutpUzy1rR` is READY and aliased to https://company-humans.vercel.app. Its live health reports `89813dda05c32bc9f3087d7f8ffb5c4f7ab4ef94`; anonymous organizations and unsigned JSON usage requests return 401 and workspace Apps redirects to sign-in. Real OAuth login, hosted worker dispatch, provider cleanup and Scalar access remain unverified.

### Request-time member eligibility — 2026-09-22

0064 closes the gap between pending member intent and current catalog, sponsor, actor and target policy. The service and database insert policy require a ready product with valid metadata, compatible instance mode and `provision` operation, active sponsor and administrator, active target and every registered catalog-required permission on that target's organization role. Direct SQL and service requests serialize with catalog, authorization, organization-status and member-status edits. Admin candidate search excludes ineligible people; an existing blocked mapping requires reconciliation. A fresh disposable database applied all 64 migrations and seed; the full suite passed 347 tests (70 contracts, 42 database, 235 web). Repository typecheck, lint and production build passed on the final revision. The tests observe actual lock waits for four authority changes in both commit orders. This is still pending intent, not live Scalar access or provider acceptance.

The hosted verification migration from `1d553e5` rolled back because the non-owner migration login could not grant execution after transferring helper ownership. Corrected `fd6ca8c` applied 0064. Its first seven-test hosted run passed five and exposed two hosted fixture assumptions: the migration login is also a service-role member, and cannot run `DROP OWNED` on a test role. The test role left by that cleanup failure was explicitly revoked and removed. Migration 0064 was already checksummed, so `fb90c78` restored its exact applied bytes and added 0065 for the actor-context guard; it also replaced test cleanup with explicit revokes. A fresh local 65-migration replay passed 347 tests, typecheck, lint and build. Hosted verification applied 0065 and both previously failing tests passed; both hosted databases replay `fb90c78` with no pending migration.

[CI run 35804999892](https://github.com/mosnin/company-humans/actions/runs/35804999892) passed migration/seed, all tests, typecheck, lint, browser checks, anonymous runtime and signed usage HTTP/database verification on `fb90c78`. Production Vercel deployment `dpl_2mNQzy8DjS4hsmHcjLDxCTfPRcxe` is READY and aliased to https://company-humans.vercel.app. Live health reports exact revision `fb90c789b1cee213bf4427c71b0569a986dcf1be`; anonymous organizations and unsigned JSON usage requests return 401, and Apps redirects to sign-in. No authenticated Google/email or live Scalar access was demonstrated; Phase 01 and 02 remain In progress.

### Activation readiness diagnostic — 2026-09-22

A tenant-scoped server diagnostic now checks current suspended member binding, target authorization, full capability apply/readback, applicable finite-limit apply/readback and unresolved denial history. It requires both application and budget administration and produces reason codes only; it sends no provider request and never grants access. Even a locally complete fixture remains blocked by `meter_semantics_unverified` because catalog meter keys lack a verified unit/window/provider enforcement mapping. A production workflow to clear `policy_blocked`, a durable grant worker and real Scalar proof remain open. A fresh local 65-migration replay passed 348 tests (70 contracts, 43 database, 235 web), typecheck, lint and production build. Phase 02 stays In progress.

The focused diagnostic integration passed on hosted verification in 19.14 seconds. Both hosted verification and production replayed immutable `8842d0b3318d7865ef3ef20e15cf536a3f3ef327` with no new migrations. [CI run 35806677583](https://github.com/mosnin/company-humans/actions/runs/35806677583) passed migration/seed, tests, typecheck, lint, browser, anonymous runtime and signed usage HTTP gates. Production Vercel deployment `dpl_5QABSKCeoAMyv5fLBk5hdSgQgsU4` is READY and aliased to https://company-humans.vercel.app; live health reports that exact code revision. Anonymous organizations and unsigned usage return 401; Apps redirects to sign-in. This is deployed diagnostic code, not verified Google/email login, live Scalar control or sponsored access.

### Versioned meter enforcement declaration — 2026-09-22

The shared contract now validates the shape of a claimed exhaustive variable-cost meter declaration, including meter definition version/unit/aggregation, finite UTC windows, organization/member scopes, pre-cost hard stop and accumulated-usage preservation. Revision 0 is allowed because new products begin there. This is schema-only preparation: the claim is not persisted or compared with catalog/registered meters, existing V1 limits cannot be matched by meter version, and Scalar has not verified enforcement. Activation remains blocked. A fresh local database replayed and seeded migrations 0001–0065; 351 tests passed (73 contracts, 43 database, 235 web), plus repository typecheck, lint and production build. CI and hosted release are separate gates.

The declaration-only revision `e7dff945a5e14fa4f13a0c62308ca355ea5c04fc` passed CI run 35807613281 and deployed READY as `dpl_ZAgw3UDzEixMAh2GiVXrAapVkyfc`; the live health endpoint reports that exact revision. The deployment does not establish authenticated use or provider enforcement.

### V2 usage-limit transport contract — 2026-09-22

A distinct V2 finite-limit request, receipt and readback shape carries `meterVersion` with an explicit V2 adapter marker. Exact matching checks policy identity, target, scope, quantity, meter version, hard-stop mode and accounting. V1 adapters still serve their old scope; no V2 database field, worker, catalog registration or Scalar implementation exists. A fresh disposable PostgreSQL database replayed and seeded migrations 0001–0065, and 355 tests passed (77 contracts, 43 database, 235 web), followed by root typecheck, lint and production build. This is local contract verification only.

[CI run 35808226396](https://github.com/mosnin/company-humans/actions/runs/35808226396) passed the V2 contract revision `c6c9e86327e6b7b8c7018d27be6fc87b43cd602e`. Production Vercel deployment `dpl_3mbyAHYu6ye7fZd5L3uddNGQh2KG` is READY and aliased to https://company-humans.vercel.app. Live health reports that exact SHA; anonymous organizations and unsigned usage POST return 401, while Apps redirects to sign-in. Real authenticated Google/email and provider enforcement remain unverified.

### Versioned limit storage fence — 2026-09-22

Migration 0066 adds contract and meter version columns without changing historical V1 rows. A V2 row must identify a positive meter version, does not enqueue a V1 job, cannot be followed by a V1 downgrade, and cannot be written through the current budget service role. The V1 worker also rejects a V2 row before forming provider state. Existing V1 configuration and delivery remain intact. The focused storage and worker integrations passed; a fresh disposable database replayed and seeded 0001–0066 and passed all 355 automated tests (77 contracts, 43 database, 235 web). Root typecheck, lint and production build passed. No V2 writer or remote provider enforcement exists.

Committed revision `9b1bf72ea2522f27906c2c605f5ca913db765abc` applied 0066 to hosted verification; both affected PostgreSQL integrations passed there in 75.31 seconds. Production then applied the same immutable migration without fixture writes, and both hosted databases replay with no pending migration. [CI run 35808701374](https://github.com/mosnin/company-humans/actions/runs/35808701374) passed all quality gates. Vercel deployment `dpl_DHZK6LQ2ZW5w9oXphARjfDnTpw82` is READY; live health reports that exact SHA. Anonymous organizations and unsigned usage POST return 401, while Apps redirects to sign-in. These checks do not prove authenticated sign-in or provider hard stops.

The existing Google Cloud browser session is stopped at its first-use Terms of Service checkbox. Computer-use policy requires confirmation at action time before accepting that legal agreement; confirmation was requested. Google OAuth setup and real sign-in remain unverified. Independent implementation work continues.

### Meter declaration registry comparison — 2026-09-22

Migration 0067 adds a narrow, non-login operator role to read global catalog and immutable meter definitions. A server-only comparison checks the claimed product revision, ready catalog, exact active meter key set, and each claimed registered version/unit/aggregation under repeatable-read isolation. It reports local compatibility only and always states provider enforcement unverified and activation unavailable. Duplicate catalog keys, stale revisions, missing/wrong definitions, malformed catalogs and explicit empty declarations are covered. A fresh disposable database replayed and seeded 0001–0067; 356 tests passed (77 contracts, 44 database, 235 web), with root typecheck, lint and production build. No Scalar control call, certified declaration or access grant exists. Hosted migration and CI remain separate gates at this checkpoint.

Committed `77ac96c425bb1efb0e7a245dcdb901f36c2e7624` applied 0067 to hosted verification; the restricted comparison integration passed in 2.67 seconds. Production applied the same migration without fixtures, and both hosted databases replay with no pending migration. [CI run 35809446576](https://github.com/mosnin/company-humans/actions/runs/35809446576) passed. Production deployment `dpl_3ecRePNoXdgtFXnmG1WyCAdoX8qy` is READY; live health reports the exact committed SHA. Anonymous organizations and unsigned usage POST return 401; Apps redirects to sign-in. This remains a local registry diagnostic, not live Scalar hard-stop or authenticated OAuth acceptance.

### Scaffold cleanup sweep — 2026-09-22

The web route/component and asset inventory found no copied Company OS product screens or media in the destination. Remaining Company OS mentions in application files identify the source of generalized visual primitives; the Company OS catalog entry is an intended integration. Historical Clerk migration files and a browser assertion that GitHub sign-in is absent must remain. The unused `tw-animate-css` global import and package dependency were removed; the loading spinner uses Tailwind's built-in utility. This is a build cleanup, not a new product capability.

A clean Node 24 `npm ci` installed 447 packages with zero reported vulnerabilities. Root typecheck, lint and production build passed; all 96 desktop/mobile Playwright fixture checks passed after removing the stylesheet import. No production user flow changed and no migration was added.

Commit `f09b190bbf3ed3af3af39d0de68b96c68a6c9897` passed [CI run 35810067348](https://github.com/mosnin/company-humans/actions/runs/35810067348). Production deployment `dpl_EhckRwBxTxEEjAeiQNy15wSW6ZDQ` is READY and aliased to https://company-humans.vercel.app. Live health reports that exact SHA; anonymous organizations and unsigned usage POST return 401, and Apps redirects to sign-in. These probes establish the release identity and anonymous access boundaries, not authenticated or provider acceptance.

### CH-22 budget contract preparation — 2026-09-22

A shared versioned policy shape and pure resolver now retain all applicable finite meter-quantity thresholds across organization, product, product-instance, one attributed team, member, capability and meter scopes, with exact UTC windows. Capability and meter identifiers remain separate. Each threshold keeps its own action; the earliest threshold summary does not authorize or stop work. A dedicated budget canonical ID avoids conflating future budgets with existing V1 product usage limits. Independent review found and prompted corrections to product scope, team attribution claims, malformed team context and policy identity. The corrected contract has 86 passing contract tests, and root typecheck, lint and production build pass. The prior fresh 67-migration suite passed 364 tests before those corrections; database and web code were unchanged. CH-22 remains in progress: no budget storage, trusted complete policy read, team membership verification, consumption evaluation or provider hard stop exists.

Commit `46d19d0768fe6387680d30c6b6a90018c28ac323` passed [CI run 35811343564](https://github.com/mosnin/company-humans/actions/runs/35811343564). Production deployment `dpl_AX2PbEk7ETTS9oJLi7nxBU7Y3n5J` is READY at https://company-humans.vercel.app; health returns that exact SHA. Anonymous organizations and unsigned usage POST return 401, and Apps redirects to sign-in. The pure budget contract is not yet called by production paths, and these probes do not establish budget enforcement.

### Team assignment history prerequisite — 2026-09-22

Migration 0068 adds trigger-maintained private active/closed assignment intervals for new team membership changes and a conservative cutover baseline for existing active rows. It does not reconstruct pre-cutover intervals. A fresh local migration/seed passed; all 45 database tests passed, including no-delay interval boundaries and restricted service-trigger execution, and a separate partial-migration cutover fixture reported `baseline_verified`. Independent review accepted fixes to trigger-creation privilege order and monotonic starts. Root typecheck, lint and production build pass. A historical usage-ingestion guard, complete team attribution and actual budget enforcement remain open. This history is not a spend permission.

Committed `452752663b4c3a81322b82ed634ac510a3c99d60` applied 0068 to hosted verification under its non-superuser migration role. The focused PostgreSQL history integration passed there in 4.05 seconds.

[CI run 35812612607](https://github.com/mosnin/company-humans/actions/runs/35812612607) passed all quality gates. Production applied the same committed 0068 migration; both hosted databases replay with no pending migration. Vercel deployment `dpl_7ARqyJWGsf5koykAqUQxs1TWJWAe` is READY at https://company-humans.vercel.app, and live health returns the exact committed SHA. Anonymous organizations and unsigned usage POST return 401; Apps redirects to sign-in. These checks do not prove team-attributed ingestion or budget stops.
### 0069 temporal human usage team guard — 2026-09-22

Migration 0069 checks named human usage teams against the private assignment interval at event occurrence and rechecks quarantined legacy rows before release. The signed ingestion path preserves exact retries after assignment removal and returns a redacted 422 for disproven team attribution. Fresh local migration/seed, 369 automated tests, root typecheck, lint and production build passed. A separate disposable two-client test passed in both commit orders with observed lock waits and concurrent exact retry behavior; independent review accepted the bounded guard. Provider team binding and real team budget enforcement are not yet verified. Phase 03 remains in progress.

Commit `780d01801f49ebe9e937420e4b3d5786ff712c75` passed [CI run 35814341262](https://github.com/mosnin/company-humans/actions/runs/35814341262). The hosted verification 0069 migration and focused restricted-role test passed; production applied the same immutable migration and both hosted replays report no pending SQL. Vercel deployment `dpl_BWaRXebmgbb9MDFpsHYcFGbnkyJj` is READY, with live health at the exact commit SHA. Anonymous organizations and unsigned usage POST deny with 401; Apps redirects to sign-in. Provider-side attribution and budget enforcement remain unverified.

### CH-22 versioned budget configuration — 2026-09-22

Migration 0070 stores exact product meter/version/unit policies with typed organization, product, product-instance, team, member, capability and meter scopes. Multiple thresholds may coexist; immutable revisions preserve exact quantities, six actions and active/disabled state. The admin API creates, revises and reads the complete current set for one product meter with `providerEnforcementConfirmed=false`. A pure projection excludes disabled policies before resolution. A restricted database guard now serializes writes with permission, organization, member, user and catalog revocation; direct SQL and application writers use the same lock order. Fresh local migration/seed, 438 automated tests, root typecheck, lint and production build passed. Two-client tests covered both permission commit orders and revoke-first catalog, member and user changes. This is configuration only: no consumption evaluation, capacity reservation, cross-product priced budget, complete trusted operation-team binding or provider stop. Phase 03 and CH-22 remain in progress.

Commit `f30f84fc4ec49abda76fd15612c3d80b5cb0bfa0` passed [CI run 35817135292](https://github.com/mosnin/company-humans/actions/runs/35817135292), including browser, built anonymous runtime and signed usage HTTP checks. Hosted verification applied the exact 0070 migration and its restricted storage test passed 2/2 with a 30-second timeout for network latency. Production then applied the same committed migration; both hosted replay checks report no pending SQL. Vercel deployment `dpl_CfgeMhcUPi6UcbRu3mqhHXBQ6Qzo` is READY at https://company-humans.vercel.app, and live health reports the exact commit SHA. Anonymous organizations, unsigned usage POST and budget GET return 401; Apps redirects to sign-in. No authenticated budget decision or provider hard stop was exercised. CH-22 and Phase 03 remain in progress.
