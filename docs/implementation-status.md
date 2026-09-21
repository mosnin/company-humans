# Implementation status

Updated 2026-09-21. Destination: `mosnin/company-humans`, branch `codex/company-human-foundation`, [draft PR 1](https://github.com/mosnin/company-humans/pull/1). Company OS remains unchanged.

## Verified locally

- Shared canonical IDs, signed event/audit contracts, migration checksums, deterministic product seeds, and versioned adapter interface.
- A restricted test service creates real canonical users, organization and membership, then signs a shared event; changing its tenant invalidates the signature.
- Identity synchronization, tenant isolation, stored capabilities, audited permission changes, invitation lifecycle, team scope, and append-only runtime audit permissions.
- Direct contributor SQL cannot promote itself, change the organization, become a team manager, grant permissions, or activate a product.
- People, Teams, Permissions, and Audit pages use scoped services. The shell generalizes Company OS's header, rail, canvas, form, and table design.
- Invitation acceptance requires the authenticated Convex OAuth profile's verified email. The token survives sign-in in tab storage for 30 minutes and clears on acceptance.
- 54 contract/database/route/Convex tests pass. Twenty desktop/mobile browser component tests pass with explicitly mocked authentication/API responses. Typecheck includes test sources; lint and production build pass.
- The local development and verification databases have 21 migrations applied; the development baseline includes seven reference-product seeds. Restricted connection credentials are stored only in ignored `apps/web/.env.local`; no OAuth provider secrets or tenant demo records were created.

## Phase gates

| Phase | Status | Remaining acceptance |
| --- | --- | --- |
| Source scaffold | Implemented; local checks pass | Live authenticated layout and deployment verification. |
| 00 Foundation | Verified at 3fbc494 | Public GitHub run 35522115426 passed install, typecheck, lint, migrations, seed, tests, build and browser checks. |
| 01 Identity kernel | In progress | Real Convex OAuth sign-in/sign-out, browser create/invite/accept/assign/switch/suspend scenario, deployed database-role verification. |
| 02 Provisioning | In progress; groundwork only | Real Scalar adapter, product membership, entitlements, state machine, health, and full lifecycle proof. Catalog/pending intent grants no access. |
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

1. **Convex deployed; OAuth and development capacity remain:** dedicated free-plan project `company-humans` / production `sensible-dinosaur-165` was created and deployed on 2026-09-21. Signing keys, live anonymous identity denial, OIDC discovery and public JWKS were verified. A separate development deployment still fails with the 40-deployment quota. `SITE_URL`, Google/GitHub provider configuration and actual OAuth round-trip remain required. See [authentication setup](authentication.md).
2. **GitHub Actions resolved:** the owner authorized making `mosnin/company-humans` public. Run 35522115426 at 3fbc494 passed all steps, including the Convex replacement. The earlier private-repository restriction no longer blocks CI.
3. **Production web:** the Convex backend is deployed, but no Company Human web deployment or production PostgreSQL-role acceptance has been demonstrated. No existing product deployment or credential has been reused.

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
