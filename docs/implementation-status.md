# Implementation status

Updated 2026-09-21. Destination: `mosnin/company-humans`, branch `codex/company-human-foundation`, [draft PR 1](https://github.com/mosnin/company-humans/pull/1). Company OS remains unchanged.

Current remaining work and acceptance gates: [remaining phased build plan](remaining-build-plan.md), rebased against committed application revision 2175f4c and the canonical Notion roadmap. Historical sections below retain their original evidence counts and deployment state.

## Verified locally

- Shared canonical IDs, signed event/audit contracts, migration checksums, deterministic product seeds, and versioned adapter interface.
- A restricted test service creates real canonical users, organization and membership, then signs a shared event; changing its tenant invalidates the signature.
- Identity synchronization, tenant isolation, stored capabilities, audited permission changes, invitation lifecycle, team scope, and append-only runtime audit permissions.
- Direct contributor SQL cannot promote itself, change the organization, become a team manager, grant permissions, or activate a product.
- People, Teams, Permissions, and Audit pages use scoped services. The shell generalizes Company OS's header, rail, canvas, form, and table design.
- Invitation acceptance requires the authenticated Convex OAuth profile's verified email. The token survives sign-in in tab storage for 30 minutes and clears on acceptance.
- 114 contract/database/route/Convex tests pass. Forty-four desktop/mobile browser component tests pass with explicitly mocked authentication/API responses. Typecheck includes test sources; lint and production build pass. Hosted CI at 84653c1 passed in run 35640077777.
- Local development/verification and hosted verification/production databases have 30 migrations applied, with seven reference-product seeds. Local credentials remain in ignored environment files, including mode-0600 Neon files; Vercel holds restricted runtime credentials. OAuth provider client credentials and real authenticated acceptance remain outstanding.

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
