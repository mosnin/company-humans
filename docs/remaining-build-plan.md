# Company Human — remaining phased build plan

Rebased 2026-09-21 against committed application revision `2d4b5d7`, current implementation evidence, all 92 captured tracker tasks, and the previously captured canonical Notion roadmap. This is an execution plan, not a replacement PRD. Explicit owner directions apply: `mosnin/company-humans`, Convex OAuth, organization-sponsored ecosystem access, and all three beta configurations.

## Current position

- Phase 00 is verified. Preserve the scaffold, shared contracts, IDs, migrations, seeds and CI; do not restart them.
- Phase 01 has substantial implementation and security evidence, but real OAuth and the authenticated organization lifecycle remain unverified.
- Phase 02 has catalog, organization provisioning machinery, member diagnostics, product-member mapping, local product disable, and a restricted suspend/remove executor with durable receipts and service audit. No real Scalar provisioning or member access has been demonstrated. Persisting a command does not revoke access in a remote product.
- Phases 03–15 remain unfinished; Phase 16 is conditional expansion.
- Dedicated Convex, Neon PostgreSQL and Vercel resources exist. The stable web deployment was verified at `8d72e92`; latest code is newer. Preview READY does not prove production acceptance.
- Current recorded verification: 166 automated contract/database/route/Convex tests; 35 applied migrations; typecheck/lint/build pass. The usage-limit editor has recorded 62 passing desktop/mobile fixture checks and full local checks. These are recorded results, not a fresh test run or live provider acceptance.
- Exact finite organization/member usage limits, immutable revisions, scoped administration reads and the authenticated mutation API are committed. The usage-limit editor is implemented and locally verified. Saved limits do not yet stop remote product usage.
- Organization/member entitlement configuration, scoped reads, mutation API and administration UI are implemented. Member access requests and tenant-scoped member selection are implemented. Both return or display unconfirmed provider access; neither grants remote access.
- Adapter V2 now requires creating a remote member suspended and validates that receipt. The restricted V2 suspended-creation worker and receipt-backed suspended identity binding are implemented with local and hosted database verification; real Scalar transport, policy/limit acknowledgement, reconciliation and final activation remain incomplete. Existing V1 organization and denial workers are preserved.

## Replanning checkpoint — 2026-09-21

This refresh preserves the canonical phase numbers and does not restart completed infrastructure. The Notion roadmap and tracker schema were fetched again for this planning pass. Recorded test counts above were read from repository evidence; no application test suite was rerun for this documentation update.

### Finish the current bounded change

The working tree contains migration `0036_provisioner_receipt_retention.sql` and related provisioning code/tests. They are not part of committed revision `2d4b5d7`. Complete review of receipt retention after permission revocation/product disable, service actor auditing and original initiating-user fencing. Confirm final local and hosted verification, migration application/replay, documentation and commit before counting this change as delivered. Retaining a provider receipt does not itself implement reconciliation or safe activation.

### What has advanced since the previous baseline

- Exact usage-limit adapter contracts, immutable revision jobs, restricted apply/readback execution and administration diagnostics are committed. They have fixture-backed verification; no real provider hard stop has been demonstrated.
- Existing-organization connection intent and dispatch are committed. Provider authorization, real Scalar transport and the user-facing connection flow still need implementation and acceptance.
- Suspended member creation and receipt-backed identity binding exist. Effective entitlements, complete limit acknowledgement, safe activation/resume and reconciliation remain work to do.

### Delivery checkpoints

1. **Usable identity:** real OAuth plus a two-organization membership/permission lifecycle (Phase 01).
2. **Usable sponsored Scalar:** real organization/member lifecycle, finite usage enforcement and administrator visibility (Phases 02–03).
3. **Usable human workspace:** contributor work, CRM, scoped context and manager workflows (Phases 04–06).
4. **Real commercial loop:** recoverable merchant attribution, commissions and reconciled payouts (Phases 07–08).
5. **Configurable ecosystem:** remaining products, creator workflows and enterprise configuration (Phases 09–11).
6. **Production acceptance:** resilience, Chippi dogfood, telemetry-based pricing and three beta configurations (Phases 12–15).

Security, isolation, audit and design verification accompany every checkpoint. Phase 12 is the integrated resilience gate, not a reason to defer those protections.

## Execution rules

Work through one bounded task at a time. Keep canonical tracker IDs and phase order. An unavailable provider may permit independent preparation, but cannot satisfy a phase gate or allow dependent product access to be treated as complete.

For each task: read its Notion acceptance; inspect existing code; identify dependencies; implement; run relevant tests, typecheck, lint and build; test the runtime and tenant boundary where applicable; record evidence; commit; update implementation documentation and Notion. Track Not started, In progress, Blocked, Implemented and Verified separately. Preserve historical evidence and identify its revision/environment.

Audit cleanup belongs to the phase touching that code: classify copied source as reuse unchanged, generalize, replace, remove or investigate. Remove unrelated Company OS behavior/assets/dependencies only after identifying references and verifying affected routes. Preserve inherited typography, layout, responsive behavior and interaction quality. Never edit the source repository.

## Phase 01 — finish usable identity and workspace membership

**Tracker:** CH-6–CH-12. **Status:** In progress.

1. Configure the selected OAuth provider's application and secrets for dedicated Convex Auth; verify callback, verified email, session issuance, canonical user synchronization and logout/revocation. Clerk remains excluded.
2. Establish an isolated nonproduction auth/database configuration; resolve the additional Convex deployment quota or document a supported local test arrangement. Never give arbitrary previews production credentials.
3. Deploy the current verified identity revision and verify its exact source and migrations.
4. Complete any missing organization creation, switching, team/role assignment, invitation acceptance/expiry/revocation, suspension/removal and session feedback exposed by real browser testing.
5. Exercise owner, admin, manager and contributor permissions with separate real accounts and two organizations. Check direct API access and restricted database connections, not only hidden UI.
6. Verify audit provenance and tenant denial through the authenticated application. Compare desktop/mobile states against the inherited design, including loading, empty, error, disabled and permission states.

**Exit:** A real Chippi organization can invite a contributor, assign team/role, switch organizations, suspend/remove access, sign out, and demonstrate cross-tenant denial. No fixture authentication in this acceptance.

## Phase 02 — real sponsored application access, Scalar first

**Tracker:** CH-13–CH-19. **Status:** Groundwork implemented; provider acceptance absent.

1. Finish Applications administration: expose the implemented generic connection intent/dispatch boundary through an authorized provider connection flow; finish connect/create organization, enable/disable product, configure access, view health, inspect failures and request safe retry/reconciliation.
2. Extend the implemented restricted durable V2 suspended-member bootstrap and identity binding: apply current access and finite limits, verify provider state, revalidate membership/policy and only then resume access. Reject incompatible adapters without falling back to V1 member creation. Implement authorized resume and safe restore. Retain leases, bounded retries, stable idempotency, validated receipts and stale revision rejection. Add provider-aware reconciliation for ambiguous results and hosted worker operation under restricted credentials.
3. Complete the remote portion of product disable and offboarding; local disable, durable commands, restricted denial execution and admin progress views are implemented. Workspace suspension/removal must deny local access immediately and durably reconcile remote access; expose pending/failed remote revocation honestly.
4. Verify the implemented versioned organization defaults/member overrides and scoped administration with real identity. Implement desired-versus-effective access, provider acknowledgement and role/team scope through the canonical resolver. Re-enable only through authorized intent; do not resurrect stale access on membership resume.
5. Resolve the [member bootstrap control gap](member-provisioning-control-gap.md): remote identity creation must not permit spend before entitlements and finite limits are applied. Confirm Scalar's supported organization/member control API and authentication. Its existing account API key or CRM MCP access is not proof of a provisioning contract. Document upstream contract gaps before altering architecture.
6. Implement Scalar connect/create, provision, suspend, resume, remove, access application, limits, health and safe launch/deep links. Bind all external identities to their canonical organization/member mapping.
7. Prove role-aware member application visibility and sponsored access without separate contributor purchases. Capture auditable provider operation state for administrators.

**Exit:** Enable Scalar for a real organization, provision a real member, suspend/resume/remove them, disable/restore the product, and reconcile failures without manual database edits. Broad expensive usage waits for Phase 03.

## Phase 03 — usage governance and centralized billing

**Tracker:** CH-20–CH-26. **Status:** Metering and commercial enforcement not started; finite-limit configuration prerequisites implemented.

1. Build versioned meters, authenticated usage ingestion, organization ownership, idempotent event storage and deterministic aggregation; handle duplicates, delays, corrections and out-of-order delivery.
2. Implement organization/product/team/member/capability budgets, warning thresholds, soft stops and hard stops with explicit precedence and auditable changes.
3. Implement the shared entitlement/policy resolver and the product-side enforcement contract, including concurrent requests and budget exhaustion during work. Determine and test outage behavior before allowing spend.
4. Connect actual Scalar measured usage and prove budget enforcement stops additional expensive operations.
5. Build versioned internal costs and customer price book, consolidated commercial state/billing projection, sponsoring-organization responsibility, usage views, invoices/payment integration required by the billing specification, and cost/margin administration.
6. Keep another organization created by the same person commercially independent. Keep merchant customer billing outside this system.

**Exit:** Real Scalar activity creates measurable organization-owned usage, the configured limit stops new spend, and cost/customer billing projections reconcile without duplicate charges or unlimited exposure.

## Phase 04 — simple contributor, manager and admin workspace

**Tracker:** CH-27–CH-31 plus the canonical UX requirements. **Status:** Not started.

1. Build role-aware navigation and configurable module visibility using the source design primitives.
2. Build contributor Home and dedicated Work, Apps, Context and Earnings destinations; show honest empty/unavailable states until their domains are available.
3. Provide Today/upcoming work, application launch/access status, team announcements and leaderboard framework. Earnings must ultimately come from the ledger; never invent balances or payments.
4. Build dedicated manager views for team work/performance and admin views for members, products, usage, budgets and operations.
5. Make admin activity visibility scoped and attributable: who acted, in which product/workspace, outcome and time. Carry human-versus-agent attribution into later modules.

**Exit:** A contributor understands their work and allowed tools without opening administration. Desktop/mobile navigation and all state handling are verified with real identity. Deep workflows have their own pages.

## Phase 05 — native Human Work and CRM

**Tracker:** CH-32–CH-37 plus assignment requirements. **Status:** Not started.

1. Implement human assignments, ownership, due dates, Today/upcoming views, completion and follow-ups.
2. Implement contacts, accounts, opportunities, pipelines/stages, relationship capital and team ownership.
3. Build activity timelines with distinct human and agent actors and source provenance.
4. Implement manager team pipeline and performance views with role/team visibility.
5. Synchronize the agreed CRM boundary with Scalar: identity mapping, retries, conflict rules, duplicate prevention and deletion/revocation behavior. Keep Scalar outbound/enrichment and Operate agent tasks in those products.

**Exit:** Real contributors run a human sales pipeline, record work, and use connected Scalar outbound with correct synchronization and tenant isolation.

## Phase 06 — scoped Company OS context

**Tracker:** CH-38–CH-41. **Status:** Not started.

1. Connect the correct Company OS organization and implement organization/team/role context scope.
2. Provide approved product, pitch, ICP and sales context with source links and freshness state.
3. Propagate scope changes and revocation through server queries, caches and any projections.
4. Explicitly deny finance, legal, executive, security and unrelated private context unless granted.

**Exit:** A salesperson can retrieve approved sales material and cannot retrieve restricted material by UI, direct API or stale projection.

## Phase 07 — referral attribution, UTM tracking and developer integration

**Tracker:** CH-42–CH-47. **Status:** Source assessment only; implementation not started.

1. Build promoters, programs, campaigns, real merchant referral links/tokens and deterministic attribution rules.
2. Use the [Callix assessment](callix-tracking-assessment.md) for reusable consent, origin, routing and idempotency patterns; implement missing UTM/referral capture, first-party persistence and delayed synchronization explicitly.
3. Build browser and server SDKs, test/production separation, scoped API keys, key rotation, signed events and idempotent ingestion.
4. Add merchant signup/conversion events and commission-purpose subscription mirrors; merchant billing remains authoritative.
5. Build request/webhook logs, signed webhook delivery, bounded retries, replay, diagnostics and integration test mode without exposing secrets.
6. Integrate real Chippi referral persistence locally in the merchant flow and prove recoverability after Company Human downtime. Upstream changes require an explicit scoped integration change; they are not unreviewed scaffold edits.

**Exit:** A real merchant referral URL attributes a real Chippi signup through navigation/login and delayed server delivery; duplicate/reordered events and an outage do not lose or double-count attribution. Browser observations alone cannot assert payment.

## Phase 08 — commissions, earnings and real payouts

**Tracker:** CH-48–CH-54. **Status:** Not started.

1. Build versioned commission rules and a provider-neutral append-oriented ledger: Pending, Approved, Available, Paid, Reversed, Disputed and Void.
2. Preserve source event, rule/price version, actor, organization, timestamp, provider reference and adjustment reason. Never rewrite paid financial history.
3. Implement release periods, approvals, refunds, chargebacks, cancellations, corrections, dispute holds and fee entries with idempotent accounting.
4. Build regulated payout-provider abstraction, recipient onboarding, batches, execution, status synchronization and settlement reconciliation.
5. Connect contributor earned/pending/available/paid views and admin exception handling to actual ledger state.
6. Complete necessary provider onboarding and payout/compliance review before real money movement; then execute and reconcile a real Chippi payout.

**Exit:** A real Chippi customer payment yields the correct commission and actual contributor payout; gross, fees, net, provider settlement and ledger agree. Company Human or payout-provider failure does not interrupt Chippi customer payments.

## Phase 09 — remaining native ecosystem access

**Tracker:** CH-55–CH-60. **Status:** Not started.

Implement one adapter at a time: Cadre, Marketer, Operate, Tell Me, Stored, then remaining Company OS contract coverage. Scalar is already required by Phase 02, not deferred here.

For each applicable capability: organization connection, member provisioning, role/access mapping, entitlements, measured usage, limits, health, suspension, offboarding, events and deep links. Expose scoped member activity/outcomes and operational failures to authorized administrators. Unsupported capabilities must be explicit, not simulated.

**Exit:** Each real product passes the common contract suite and live access/revocation/usage/limit scenarios. Products retain their deep domain data; workspace members use organization sponsorship rather than separate plans.

## Phase 10 — Creator and UGC configuration

**Tracker:** CH-61–CH-65. **Status:** Not started.

Build creator campaigns, briefs, deliverables, review/approval, publishing state, published links, tracking, Marketer connection, ledger-backed earnings and creator performance/leaderboards. Provide a creator workspace configuration with CRM and Scalar completely disabled.

**Exit:** A real creator team completes brief → deliverable → approval → publication → tracking/earnings using configuration and no tenant-specific fork.

## Phase 11 — white label and enterprise administration

**Tracker:** CH-66–CH-70. **Status:** Not started.

Implement workspace name/logo/colors, email branding, verified custom domains with safe fallback, bulk members/teams, role/budget templates, scoped usage/billing/audit exports and enterprise commercial controls. Gate SSO/SCIM on actual requirements. Verify branded authentication and domain routing cannot cross tenant boundaries.

**Exit:** An administrator configures a new branded organization and operates bulk administration/exports without code changes or private data leakage.

## Phase 12 — reliability, security and scale acceptance

**Tracker:** CH-71–CH-76. **Status:** Not started as a platform gate. Required security/idempotency protections still ship in each earlier phase.

1. Complete durable event outbox/replay, queue recovery, circuit breakers, webhook retry, rate limits, alerts, cost anomaly controls and operational diagnostics.
2. Verify backup restoration and disaster recovery in an isolated environment, with documented recovery objectives and measured results.
3. Exercise Company Human, Scalar and Cadre outages; duplicate Marketer usage; delayed usage; duplicate/out-of-order merchant events; broken webhook endpoints; key compromise/rotation; budget exhaustion; removal during active work.
4. Exercise payout-provider outage and Company Human payment-account restriction while Chippi customer billing remains healthy; reconcile recoveries without lost/double payments.
5. Run tenant penetration tests across database, API, jobs, adapters, exports, search, analytics and cache; review secrets, privacy/retention and payout compliance.
6. Load-test one 3,000-member organization using representative concurrent workflows, usage/events and administrative operations. Define and meet measurable service targets rather than counting seeded rows.

**Exit:** Recorded recovery, isolation, financial-integrity and load results pass. Production monitoring and runbooks support the actual deployed system.

## Phase 13 — real Chippi dogfood

**Tracker:** CH-77–CH-80. **Status:** Not started.

Onboard real contributors, grant real tool access, set real budgets, run real work/CRM, referrals, signups, recurring payments, commissions and payouts. Observe costs, support burden and contributor/manager friction. Fix failures and repeat without founder intervention. No simulations substitute for this gate.

**Exit:** The complete business loop runs repeatedly with real people and money, with measured costs and reconciled evidence.

## Phase 14 — pricing calibration

**Tracker:** CH-81–CH-84. **Status:** Waiting for production telemetry.

Measure cost per member/organization, product/meter/archetype, heavy-user distribution, payout/support costs, revenue influence and contribution margin. Model budgeted packages and margin floors, conduct pricing interviews, and only then propose public pricing and enterprise terms.

**Exit:** Packages are backed by observed cost distributions and a sustainable margin model with no hidden unlimited usage.

## Phase 15 — external beta

**Tracker:** CH-85–CH-88. **Status:** Not started.

Onboard and validate all three configurations requested by the owner: sales, affiliate/referral and UGC/creator. Test independent organization billing, sponsorship, module disabling, branding, admin visibility and repeatable onboarding/support. Close portability and usability gaps through shared configuration.

**Exit:** Three distinct configurations operate without custom product forks; onboarding and operational acceptance are repeatable.

## Phase 16 — conditional platform expansion

**Tracker:** CH-89–CH-92. **Status:** Deferred until first-party contracts stabilize.

Then evaluate public adapter SDK, marketplace/security review, additional payout providers, advanced organization hierarchy, analytics and enterprise capabilities. These remain conditional investments, not prerequisites to first usable Company Human.

## External dependencies to resolve without faking success

| Dependency | What is still needed | Work that can proceed independently |
| --- | --- | --- |
| OAuth provider | Provider application configuration and real account consent; current GitHub browser requires login | Local identity/security tests and deployment preparation |
| Convex nonproduction capacity | Resolve 40-deployment quota or supported isolated local setup | Existing dedicated production deployment remains available; no recreation needed |
| Scalar | Authenticated control contract, organization/member/usage/limit credentials and test organization | Executor, entitlement and adapter contract tests; no claimed remote success |
| Chippi | Approved integration environment, verified merchant events and real referral persistence | SDKs, ingestion, replay, attribution and ledger tests |
| Payout provider | Provider selection, account/recipient onboarding and applicable operational/compliance requirements | Provider-neutral ledger, transport interface and failure tests |
| Real validation participants | Chippi contributors and three external beta teams | Preparation and automated acceptance; not dogfood/pricing proof |
| Symbolic | OAuth discovery is now available; complete native account sign-in and verify access to existing runs; the installed connection does not execute new evaluations | Keep the compiled goal route and repository evidence current; do not claim a Symbolic run |

## Immediate bounded task queue

0. Finish and verify the uncommitted provisioning receipt-retention change described above; record its exact migration/deployment state and commit it independently.
1. Configure the dedicated Convex OAuth provider and prove real sign-in/sign-out with canonical identity. Complete native Symbolic sign-in separately to inspect existing runs; do not claim new evaluation execution through a read-only connection.
2. Run the real two-organization create/invite/accept/assign/switch/suspend lifecycle; repair findings and verify the exact deployed revision before closing Phase 01.
3. Use the implemented restricted usage-limit apply/readback worker and exact adapter extension (application/readback schemas and revision/target matching) to build the next orchestration stage on the implemented restricted V2 suspended-creation worker: apply current policy/finite limits to the now-bound suspended provider identity, read back state and fence activation against revoked intent. Existing request API, selection UI, V2 schema and bootstrap journal do not need rebuilding.
4. Establish Scalar's real control API and test organization. Implement its V2 adapter; prove initial denial, current entitlement/finite-limit acknowledgement, state readback and authorized activation. If upstream contracts are missing, document the concrete gap rather than simulating success.
5. Finish provider reconciliation, safe resume/restore, health, administrator retry/diagnostics and least-privilege hosted worker deployment. Verify existing access configuration and member request screens with real authentication.
6. Pass the full real Scalar organization/member lifecycle; then implement measured usage and hierarchical budgets, proving hard stops before broader expensive access.
7. Build the contributor workspace and continue Phases 05–15 in the canonical dependency order. Phase 16 remains conditional.

If OAuth or provider credentials remain externally blocked, record the blocker and complete independent implementation without closing the blocked acceptance gate. No calendar estimate or completion percentage is asserted without confirmed provider contracts and acceptance environments.

## Authority and evidence

- [Canonical Notion roadmap](https://app.notion.com/p/3e1a0db630cf819585ccd74a6968af50)
- [Canonical build tracker](https://app.notion.com/p/c1495ea132d6423989674f763497bae7)
- [Captured task and goal route](execution/README.md)
- [Living implementation status](implementation-status.md)
- [Architecture](architecture.md), [data model](data-model.md), [integrations](integrations.md), [security](security.md), [billing](billing.md), [attribution](attribution.md), [payouts](payouts.md), [testing](testing.md), [decisions](decisions.md)
