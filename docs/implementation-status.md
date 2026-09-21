# Implementation status

Updated 2026-09-21. Destination: `mosnin/company-humans`, branch `codex/company-human-foundation`, [draft PR 1](https://github.com/mosnin/company-humans/pull/1). Company OS remains unchanged.

Current remaining work and acceptance gates: [remaining phased build plan](remaining-build-plan.md), rebased against application revision b7c756a and the canonical Notion roadmap. Historical sections below retain their original evidence counts and deployment state.

## Verified locally

- Shared canonical IDs, signed event/audit contracts, migration checksums, deterministic product seeds, and versioned adapter interface.
- A restricted test service creates real canonical users, organization and membership, then signs a shared event; changing its tenant invalidates the signature.
- Identity synchronization, tenant isolation, stored capabilities, audited permission changes, invitation lifecycle, team scope, and append-only runtime audit permissions.
- Direct contributor SQL cannot promote itself, change the organization, become a team manager, grant permissions, or activate a product.
- People, Teams, Permissions, and Audit pages use scoped services. The shell generalizes Company OS's header, rail, canvas, form, and table design.
- Invitation acceptance requires the authenticated Convex OAuth profile's verified email. The token survives sign-in in tab storage for 30 minutes and clears on acceptance.
- 58 contract/database/route/Convex tests pass. Twenty-two desktop/mobile browser component tests pass with explicitly mocked authentication/API responses. Typecheck includes test sources; lint and production build pass. Hosted CI at b7c756a passed in run 35635987769.
- Local development/verification and hosted verification/production databases have 24 migrations applied, with seven reference-product seeds. Local credentials remain in ignored environment files, including mode-0600 Neon files; Vercel holds restricted runtime credentials. OAuth provider client credentials and real authenticated acceptance remain outstanding.

## Phase gates

| Phase | Status | Remaining acceptance |
| --- | --- | --- |
| Source scaffold | Implemented; local checks pass | Live authenticated layout and deployment verification. |
| 00 Foundation | Verified at 3fbc494 | Public GitHub run 35522115426 passed install, typecheck, lint, migrations, seed, tests, build and browser checks. |
| 01 Identity kernel | In progress | Real Convex OAuth sign-in/sign-out, browser create/invite/accept/assign/switch/suspend scenario, and acceptance of the latest deployed revision. Restricted web credentials are configured. |
| 02 Provisioning | In progress; groundwork only | Real Scalar adapter, member-command execution, entitlements, hosted worker, health, and full lifecycle proof. Mapping and pending intent grant no access. |
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
