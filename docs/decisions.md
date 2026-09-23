# Decisions

Dated entries are historical. The latest authentication decision below supersedes the earlier Clerk selection.

## 2026-09-20: Copy the visual foundation, isolate Company OS behavior

Company OS Web uses Convex Auth and a Convex company data model. Company Human's canonical specification requires Clerk authentication and database tenant policy. Reusing the source auth, billing, or product routes would create conflicting sources of truth. The scaffold copies the Next.js stack and audited UI primitives, then implements Company Human's domain contracts independently in roadmap order. See [migration assessment](migration-assessment.md).

## 2026-09-20: Confirm destination repository

The user confirmed `/company-humans` as the intended destination. The local checkout is a clone of `mosnin/company-humans`; `mosnin/company-os-web` remains source only.

## 2026-09-20: Use a separate runtime role for tenant reads

The migration owner connection can bypass RLS and therefore must not serve tenant read routes. A restricted `company_human_app` role has only SELECT and limited organization UPDATE privileges. A distinct login granted this role is configured through `DATABASE_RUNTIME_URL`; the database helper checks it is neither superuser, BYPASSRLS, nor table owner. The server sets a transaction local canonical user after Clerk authentication. This role remains trusted server infrastructure because a holder of the SQL credential could change its own custom context setting. No database credential may reach clients.

## 2026-09-20: Keep initial roles explicit and scope managers to their teams

The six initial organization roles have canonical IDs and an explicit capability matrix in the shared contracts package. Finance and Developer start with narrow domain permissions. Team managers can assign members to an assigned team, while creating teams and assigning manager status require Owner or Admin. Job labels such as salesperson and creator remain workspace templates, not core roles.

## 2026-09-20: Use one use invitation tokens and preserve removed team history

Invitation tokens are random and stored only as hashes. A logged in Clerk user may accept an invitation only when their canonical active email matches its recipient. A removed membership can be reactivated by a fresh invitation, retaining its canonical identity, while prior team assignments stay ended. Invite delivery currently requires an Admin to share the returned token; no email provider has been selected. Provider session revocation and external product offboarding remain explicit Phase 01 and later integration work.

## 2026-09-20: Treat the active organization cookie as a preference

Organization switching writes an HttpOnly preference cookie only after a restricted RLS membership check. Every context read rechecks the selected organization against the signed in canonical user. A changed or stale cookie cannot grant another tenant's access. The browser UI cannot be accepted until live Clerk and a production runtime database role are configured.

## 2026-09-20: Require transactional audit for identity mutations

The restricted application role no longer updates organization rows directly. Narrow server services append a versioned audit envelope and before/after state in the same database transaction as organization, role, membership, team, and invitation mutations. This provides local evidence of changes, but a production append-only audit guarantee still requires separation of migration and runtime service credentials.

## 2026-09-20: Separate product enable intent from real activation

The catalog holds seven draft first party products without invented connection metadata. An organization Admin may record an enable request, but the product instance remains pending until its adapter provisions or connects the actual external organization. The API reports pending and no entitlement is granted by the record alone.

## 2026-09-20: Record identity contract gaps before Phase 01 acceptance

The canonical data model calls for permission and role-permission records, while the current implementation resolves six fixed role policies from a versioned TypeScript matrix. This is a partial implementation of the required policy model, not a completed replacement architecture. Add persisted permission and role-permission data, or record an approved contract change, before Phase 01 is verified. The roadmap also places an adapter interface in Phase 00 while the build tracker lists it in Phase 02; the implementation currently has no adapter contract. Resolve that ordering in the tracker and implement the contract before marking either acceptance gate complete.

The current server mutation helpers use the elevated migration connection. Separate narrow service credentials and enforce append-only audit storage before claiming production tenant or audit isolation.

## 2026-09-20: Define the adapter boundary before product provisioning

The Phase 00 roadmap requires the adapter interface while tracker CH-14 assigns its implementation to Phase 02. The common version 1 contract is now defined in the shared package before a product integration, satisfying the earlier dependency without activating any product. Actual Scalar provisioning and operation semantics remain Phase 02 work.

## 2026-09-20: Repair capability enforcement before continuing provisioning

Stored grants now govern identity mutations, with operation-specific database restrictions in addition to server checks. DATABASE_URL is reserved for migrations/tests; the app uses separate tenant read, tenant service, and identity credentials. Missing, consumed, expired, and wrong-recipient invitation tokens use one unavailable error. Existing applied migrations are checksum-preserved; restrictive policies and record guard fixes are appended. This supersedes the earlier mutation-owner and static-permission limitations. Browser acceptance and audited grant customization remain open.

## 2026-09-20: Include security test sources in typechecking

The package build continues to exclude tests from published artifacts, while a separate no-emit TypeScript config now includes every test source in the typecheck gate. The restricted service test also verifies the Foundation exit scenario using actual canonical identity and a signed shared event. Hosted CI remains blocked by GitHub account billing rather than a runner test result.

## 2026-09-20 — Replace Clerk with Convex OAuth

The product owner explicitly requested Convex OAuth instead of Clerk and authorized making `mosnin/company-humans` public. Convex Auth will manage OAuth sessions; PostgreSQL remains the canonical user/organization/authorization store required by the existing tenant model. Provider issuer and subject replace the Clerk-specific key without changing canonical IDs or merging accounts by email. Invitation redemption still requires provider-verified email. Applied migrations remain immutable. The Notion identity doctrine and hub record this override.

OAuth is authentication, not product provisioning: workspace-sponsored access, role-scoped product views, usage/activity reporting, and administrator oversight across Stored, Cadre, Operate, Marketer, Company OS and the other specified products remain required adapter behavior.

## 2026-09-21 — Persist provisioning state before provider dispatch

CH-15 is progressed as an independent dependency while GitHub browser sign-in blocks the live OAuth gate, as permitted by the external-blocker execution rule. The initial operation journal is bounded to provisionOrganization; it preserves durable intent, leases, attempts, partial references and audit without inferring provider activation. Five attempts and a two-minute lease are conservative internal defaults, not commercial entitlements. Background dispatch, explicit retry generations and provider-aware polling must be implemented before enabling unattended external calls. This does not change the canonical thin-kernel architecture or waive the Phase 01 tenant/authentication gate.

## 2026-09-21 — Restricted dispatcher activation boundary

The next CH-15 increment uses a separate non-login provisioner role with journal and provisioning-audit privileges only. It cannot edit identity, grants or raw product instance fields. A narrowly granted database function will validate a live lease, active actor/capability and enabled pending provisioned instance before binding the external organization and activating it inside the receipt transaction. The dispatcher must bind its adapter to a catalog product before claiming work. This implements the existing provisioning flow; it does not register a real Scalar adapter or prove sponsored member access. Provider timeout is ambiguous and must reuse the existing idempotency key.

## 2026-09-21 — Managed PostgreSQL migration ownership

A dedicated free-plan Neon project and isolated verification branch were created for the canonical PostgreSQL kernel; Convex continues to own OAuth sessions. The first real hosted migration transaction failed on function ownership transfer because PostgreSQL 16+ gives a non-superuser CREATEROLE owner ADMIN but not SET membership in newly created roles. The runner now uses transaction-local createrole_self_grant=set on PostgreSQL 16+ so it can transfer the restricted activation function to its dedicated owner. It does not enable INHERIT, change runtime login grants or rewrite existing migration checksums. This preserves the canonical architecture; managed-host verification is required before accepting it. Reference: https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-CREATEROLE-SELF-GRANT

## 2026-09-21 — Serialize membership denial before provisioning insertion

Product-member offboarding is integrated with the existing membership transaction. Commands preserve desired intent and provider state separately. An initial FOR SHARE row lock hit the existing policy protecting owner memberships; migration 0024 uses a shared advisory lock without weakening that policy or rewriting applied migration 0023. Broader concurrency testing then reproduced a lock-order deadlock between membership FOR UPDATE and a mapping foreign-key check. The service now acquires the transition advisory lock before its explicit membership row lock. Provider execution remains a separate, unverified boundary.

## 2026-09-21 — disable without fabricating provider state

An actual PostgreSQL test found the earlier product update policy allowed only pending-state rows, preventing safe disable of active products. Migrations 0025–0026 preserve applied checksums, permit desired-access denial, and make provider status immutable to general service credentials. Re-enabling a disabled instance now explicitly requires reconciliation rather than resetting status to pending against an already completed initial operation. A full restore workflow remains required by Phase 02; this restriction is not acceptance of that workflow.

## 2026-09-21 — persisted denial outlives its initiating administrator

A worker that requires the original administrator to remain active can strand remote offboarding. The denial dispatcher therefore uses a separate restricted credential and only processes previously authorized, immutable suspension/removal intent. Job provenance distinguishes the original human command from the executing credential. It cannot grant access or update provider projections. Provision/resume still need a separate authorization/entitlement receipt boundary. Timeouts are not cancellation; provider-specific reconciliation remains an explicit Phase 02 gate.

## 2026-09-21 — audit background execution as a service

Canonical documents 03 and 05 require actor attribution and audit for adapter activity. Attempt logs alone were not visible in central audit history. Migration 0028 adds service actor identity while preserving existing human events. The denial worker records its own execution and links to the original human command; it does not impersonate the initiating administrator. This prerequisite was completed before beginning entitlement grants.

## 2026-09-21 — explicit deny and preserved entitlement history

Organization defaults and member overrides follow canonical deny precedence: any explicit deny wins; otherwise explicit allow requests access; missing/inherited settings default to deny. Inherit releases one layer's preference through a new revision without deleting its history. This configuration helper must never authorize product usage on its own. CH-18 remains unaccepted until real Scalar capability and usage-limit enforcement works.

## 2026-09-21 — member bootstrap access gap identified before execution

The V1 member provision contract does not express initial remote denial while entitlements and budgets are applied. Canonical provisioning orders these steps before launch, but hidden navigation cannot protect direct product access. [Control-gap assessment](member-provisioning-control-gap.md) records the required provider verification and versioning boundary before adding an allow worker. No adapter contract has been silently replaced and no provider acceptance is claimed.

## Finite product limit representation — 2026-09-21

CH-18 needs finite product/member limits before sponsored operations can be enabled. Store meter quantities as exact decimal strings/SQL numeric (up to twelve integer and six fractional digits), including zero and excluding unlimited sentinels. Meter unit and explicit UTC calendar window are immutable policy identity; changed maxima append audited revisions. This is quantity intent, not money or allocated capacity. Unit agreement across scopes is enforced, but actual product meter/unit/window semantics still require verification. See usage-limit-semantics.md for the existing adapter contract gap and unfinished full budget hierarchy.

## Exact limit acknowledgement without breaking existing adapters — 2026-09-21

Canonical 05 requires versioned common semantics; 06 requires bounded usage and no outage-based unlimited spend. Existing V1/V2 numeric dictionaries lack the persisted limit's unit/window/revision. Add a separately versioned extension on V2, preserving existing organization/denial/bootstrap operations. Require exact aggregate/member scope and counter preservation. Unsupported provider semantics fail rather than using an inferred conversion. Contract validity is not provider acceptance or authorization to activate. See [limit semantics](usage-limit-semantics.md) for compatibility and adoption gates.

## 2026-09-21 — staged complete capability sets

Canonical documents 05/06 require entitlement application before activation and current runtime gates before spend. The legacy applyEntitlements signature does not prove provider identity, complete-set replacement, applied revision or continued suspension. ProductCapabilityAdapterV1 is an additive V2 extension requiring stageCapabilities and independent getStagedCapabilities. Existing V1 organization/denial and V2 bootstrap interfaces remain compatible; neither substitutes for this extension.

A policyRevision identifies a monotonically increasing complete member capability snapshot, not one individual preference revision. The future durable snapshot producer must assign it atomically and preserve source revisions. Providers must reject stale revisions and equal revisions with different contents, replace the entire set, preserve suspension and leave limits/counters intact. Empty sets revoke all staged capabilities. These provider obligations require live proof; schema validation alone cannot establish them. No production registration or policy snapshot journal is introduced here.

## Contributor authentication correction — 2026-09-22

User direction: Google and email magic links replace GitHub sign-in. GitHub is removed from provider registration and UI allowlisting. Convex remains the session authority. Email is delivered through Resend with AUTH_RESEND_KEY and AUTH_EMAIL_FROM on the dedicated Convex deployment; Google needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET. AUTH_ENABLED_PROVIDERS=google,email is enabled on the web deployment only after the corresponding provider configuration is verified.

Magic links expire after 15 minutes, preserve the invitation return route, and open an email confirmation page before token redemption. The custom identity callback permits an unverified email account at request time but only stamps verification after token redemption. It never merges Google and email accounts by matching email. Google and email using the same address remain separate identities pending an explicit secure linking flow.

Production delivery, Google consent, token replay/expiry in the running backend, and the authenticated workspace/invitation journey remain unverified. No provider credentials were fabricated or copied from another product.

## Independent metering preparation while provider setup is pending

The user explicitly directed continued work despite external blockers. CH-20's canonical usage contract and immutable ingestion storage can be implemented independently of Scalar deployment; this does not close Phase 01/02 or permit uncontrolled expensive access. The source is Notion documents 03 and 06 and tracker CH-20. Meter quantities reuse the existing exact 12-integer/6-fraction decimal representation. Meter definition versions are immutable. Unknown meter versions or mismatched units are quarantined rather than billed. Pricing remains separate and unknown provider cost/rate is represented by null, never fabricated zero. Authenticated public transport, key lifecycle, quarantine resolution, aggregation, budgets and real product emission remain subsequent work.

### Human usage attribution cannot trust a signature alone

Review reproduced an accepted signed event claiming a nonexistent human. A service signing key authenticates its product scope, not the existence of the claimed human. Human events now require explicit membership attribution validated against the canonical membership/user/organization relationship at the database. Delayed reports use historical membership identity regardless of current suspension.

### Fence every provider member access transition

The existing V1 resume API has no revision precondition. A delayed resume could execute after suspension and restore access. A new additive ProductMemberAccessAdapterV1 requires one monotonic revision for activation, denial and removal, plus atomic comparison of the complete current capability and finite-limit policy. Legacy denial workers are not sufficient for a registration that enables fenced grants. No live provider registration is upgraded automatically.

### Activation readiness remains closed without verified meter semantics — 2026-09-22

Canonical application provisioning applies entitlements and budgets before granting member access. The catalog currently lists meter keys, while meter definitions record unit and aggregation; neither declares which operations are expensive or the provider's enforced reset windows. A configured finite quantity and a successful transport receipt cannot establish complete hard-stop coverage. A readiness diagnostic may report current local evidence, but must return `meter_semantics_unverified` until a versioned, provider-verified enforcement mapping exists. A later activation worker must independently recheck that mapping and all current evidence under a durable access fence. No historical receipt alone authorizes a grant.

The member access command currently requires at least one limit. A product with zero catalog usage meters therefore has no representable active command. Keep such activation closed until the product contract explicitly defines whether it has no metered spend or requires a nonspend boundary; do not insert a fabricated limit. Phase 02's real Scalar lifecycle proof may use a dedicated test tenant with verified finite provider enforcement, while general production access remains gated by the Phase 03 hard-stop proof.

### Declare variable-cost meter coverage separately from provider proof — 2026-09-22

An additive version 1 declaration describes a claimed complete variable-cost meter set for a product and names one meter definition version, unit, aggregation, finite UTC windows, organization and member scopes, before-cost hard stop, and preserved accumulated usage for each key. It includes the claimed product access contract revision, including initial revision 0. Duplicate keys and windows are rejected. Parsing proves shape only: it does not compare the claim with the current catalog, registered meters, saved limits or a provider. Existing V1 limits and readbacks do not carry meter version, so they cannot satisfy this declaration. An empty set is not proof that the product has no variable cost. Persistence, versioned limit compatibility, revision fencing, independent provider evidence and real Scalar enforcement remain separate gates; activation stays closed.

### Carry exact meter version in a new limit transport — 2026-09-22

The existing usage-limit V1 policy and provider readback omit meter version. Preserve that contract for historical jobs and add a distinct V2 policy/readback shape with a required meter version. V2 matching compares the version with every other immutable limit, target, scope and enforcement field. A registration must explicitly implement the V2 methods and marker; V1-only adapters are rejected for V2 work. No existing worker is switched to V2, and no database column, manifest registration or provider has yet proven compatibility. The V1 member access command still accepts V1 limit states, so this contract alone cannot activate a member.

### Reserve versioned limit storage without dispatch — 2026-09-22

Add a contract version and meter version to limit revision rows, retaining V1 as the historical default. Restrict the current service writer to its original columns. Do not enqueue V2 revisions on the V1 journal, reject V2 rows in the V1 worker, and forbid V2-to-V1 downgrades. This creates a fail-closed migration path for a future dedicated V2 writer and worker; it does not register meters or establish provider enforcement.

### Compare meter claims with current registry under operator authority — 2026-09-22

Use a non-login, read-only operator role and a repeatable-read transaction to compare a shaped declaration with the product's current catalog revision, active catalog meter keys and immutable registered meter versions, units and aggregation. A result may report local registry compatibility, but always reports provider enforcement unverified and activation unavailable. Historical registered versions need not appear in the active catalog. This comparison is not a provider attestation and does not persist or clear an activation gate.

### Keep budget dimensions and thresholds distinct — 2026-09-22

The first CH-22 contract resolves finite meter quantities for one organization, product, exact meter version/unit and UTC window. Organization scope means that product meter across the organization; cross-product monetary budgets need a separately versioned valuation contract. Product and product-instance scopes remain distinct. Budget policies use their own canonical IDs rather than historical product usage-limit IDs. Capability keys are independent of meter keys. A cost-bearing operation has one explicitly attributed team, so policies for the member's unrelated teams cannot constrain that operation. The server must verify the operation's team membership and fetch a complete tenant-scoped policy set before calling the pure resolver; no serialized field claims verification. Missing team attribution when a team policy exists fails closed. All applicable parent and child constraints remain visible; the earliest configured threshold is only a summary, never a combined enforcement action. Each warning, approval, pause or stop belongs to its own threshold. This does not yet evaluate consumption, reserve capacity, store policies, or prove a provider hard stop.

### Preserve team attribution history before evaluating team spend — 2026-09-22

The current team membership row is mutable: removal sets an end time, and reactivation clears it. After reactivation it cannot prove whether an earlier delayed usage event occurred during an assignment or in the gap. The usage event foreign keys only prove that team and member belong to the same organization, not that they were linked at occurrence time. Preserve future assignment intervals atomically in a restricted history table. The baseline for existing active assignments begins at cutover; earlier intervals cannot be reconstructed from the current row and must never be retroactively certified. A later ingestion guard must compare signed human team attribution with the matching interval at `occurredAt`, and define nonretryable handling for pre-cutover or gap events without rewriting financial provenance. No team hard stop can rely on this history alone; product omission of team identity and complete policy retrieval also require proof.
### Reject unproven human usage teams at the database boundary — 2026-09-22

A signed human usage event may name a team only if migration 0068's private history proves the member belonged to that team at occurrence time. The same rule applies on quarantine release, including legacy rows. Valid delayed usage inside a closed interval remains accepted, while pre-cutover unknown time and assignment gaps fail closed. Exact stored retries take precedence over a later-ended assignment. The typed API response is 422 without exposing SQL details. This closes one provenance gap; it does not make null-team or provider-reported team values sufficient for budget stops.

### Store budget intent separately from historical usage limits — 2026-09-22

The existing `ch_lim_*` rows cover only product-instance and optional member quantity intent and lack the full hierarchy. Use distinct `ch_bud_*` policies bound to one exact registered product meter/version/unit and UTC window. Keep the scope in the immutable identity; revisions change finite quantity, one of the six Notion actions and active/disabled state. Several thresholds may coexist for the same scope/window. Disabled revisions remain in history and are omitted from the pure active resolver. Organization scope still means the product meter across that organization; cross-product currency limits require versioned valuation. This storage and administration path never claims measured consumption, spend permission or provider hard stops.

### Keep budget quantity comparison separate from spend authority — 2026-09-23

Notion 06 requires the budget engine to evaluate all applicable scopes and not silently allow infinite spend during failure. A pure comparison contract now requires every applicable policy scope/window quantity, one exact meter/version/unit, a trusted expected environment and meter aggregation, one evaluation instant inside each canonical UTC day/week/month period, and exact decimal arithmetic. It reports each policy's own below/reached/exceeded threshold state and action. Missing policy coverage or quantity fails closed. The caller must obtain all policies and aggregates from one authorized database snapshot; the supplied instant alone does not prove that provenance. This comparison never grants access or confirms a provider stop.

Notion 06 names capability budgets but its usage event field list has no capability identifier. The current signed usage event and aggregation also lack one. Before capability-scoped consumption can be trusted, add explicit signed capability attribution with a compatible event contract and database projection, then verify the product operation's capability against the catalog and access state. A generic metadata field is insufficient as a commercial authority. Until that path exists, capability policies cannot produce a verified database quantity and must not be treated as satisfied by zero or by an unrelated meter total.

### Preserve reported capability and unknown history separately — 2026-09-23

The usage contract now permits an explicit canonical `capabilityKey` or null in the signed payload, and migration 0071 derives a read-only key from that original envelope. Omitted historical keys remain null. A capability breakdown exposes both named and unknown usage while ordinary organization/product/member totals retain all events. We deliberately do not reject delayed events against the current capability catalog: current configuration cannot prove what was declared or authorized when historical work occurred. Future budget authorization must verify a provider operation's capability against the applicable catalog and access revision, and treat unknown attribution as unverified rather than free capacity. This migration establishes reported provenance only; it does not approve spend.

The first database-backed CH-22 composition is an advisory, read-only snapshot. Migration 0072 gives a dedicated no-login role only the projected columns required to read current policies, bindings and accepted or released usage under tenant RLS. The server reader uses one repeatable-read transaction, requires both budget-management and organization usage-read authority, and rejects incomplete policy or relevant unknown attribution. We keep both authorization and provider-enforcement flags false because reported usage is delayed, no capacity is reserved, and no provider operation or hard-stop acknowledgement is bound to this comparison. A later decision path needs a separate fenced reservation and provider confirmation protocol.

The canonical Notion billing and identity documents name informational, warning, manager-approval, soft-pause, hard-stop and emergency-shutdown actions, and require narrower policies not to exceed parent ceilings. They do not specify reservation lifetime, late-event reconciliation, exact action transitions or the manager approval workflow; the decisions document explicitly leaves that workflow open. A pre-cost reservation protocol therefore needs its own versioned, reviewable rules. Its provider operation identity must not replace the required source usage event ID and ingestion idempotency key. Until those rules and provider enforcement are verified, a projected threshold result remains diagnostic and cannot admit expensive work.

### Add signed source operation provenance without claiming settlement — 2026-09-23

The reservation contract uses a source operation identity to deduplicate pre-cost intents. The canonical usage specification separately requires a source event ID and idempotency key, which remain the usage event identities. We add an optional operation ID to the existing signed event source and project it from the immutable envelope. Omission remains valid for historical V1 signatures; no backfill or uniqueness is inferred. This is a compatibility and audit link, not proof that Scalar or another provider executed the operation. A future trusted settlement transaction must reconcile event and operation identities against accepted/released storage and prevent double use.

### Keep reservation storage inert until verified admission exists — 2026-09-23

The signed operation ID and the canonical source event ID serve different purposes; one operation may emit several usage events. The append-only ledger therefore accepts further actual-usage reconciliation after settled, released or expired capacity without rewriting terminal state, and makes a usage event unique across all entries. Migration 0075 creates no runtime grant or policy. Its JSON request/projection, fingerprint, provenance and migration-owner fixture events are untrusted candidates. SQL relational checks alone cannot prove current policy coverage, a legitimate provider operation or a verified signature. The next gate forbids any writer, reader, RLS policy, grant or provider admission until complete V1 validation, signed-event provenance, team attribution, two-client races, and independently reviewed atomic scope accounting are demonstrated.

### Reverify stored usage before financial decisions — 2026-09-23

The canonical usage pipeline requires signed events to be validated and persisted immutably. The current API does that, but its ingestion database role can insert directly using caller-set RLS context. A read-only verifier is the first containment step: it checks the stored signature under an active operator-selected key and compares the signed event with every stored projection required by a future reservation. It reports evidence only and explicitly refuses settlement eligibility. Quarantine release presence is not independent approval proof because the existing revalidator credential can also write release receipts. Direct INSERT must be replaced with a constrained verified writer before stored disposition or aggregate totals can support billing; a writer-created receipt alone would remain an attestation, not independent cryptographic proof. No existing financial history is rewritten.
