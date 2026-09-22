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
