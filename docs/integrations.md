# Integrations

No product adapters are connected. The product catalog has seven seeded draft entries. `product_instances` stores an organization's enable intent with `provisioning_status = pending`; it never reports active until a real adapter succeeds. The schema supports provisioned, connected, external only, and native module modes. Scalar is the first planned real adapter in Phase 02. Company OS, Cadre, Marketer, Operate, Tell Me, and Stored retain ownership of their deep domain data. A shared version 1 adapter interface now defines organization, member, entitlement, limit, usage, health, and navigation operations, and rejects incomplete implementations before use. No live adapter is registered, and verified source identifiers remain pending.

## Required workspace access and oversight

Scalar is the first real adapter and a primary product, followed by the specified Company OS context and ecosystem work. Stored (`stored.to`), Cadre (`cadre.to`), Operate (`operate.to`), Marketer (`marketer.sh`), and Company OS (`companyos.sh`) must expose organization-sponsored, role-scoped access through Company Human. Application enablement must provision or connect the right tenant and member, apply permissions/entitlements/limits, return scoped navigation/deep links, emit usage and activity with human/agent attribution, and support suspension/offboarding. Admin and manager views must show permitted activity, consumption, cost, outcomes and health. Static links alone do not satisfy this requirement. These are required acceptance boundaries, not claims of implemented adapters.

## Scalar source discovery — 2026-09-20

The plugin's source contract identifies `mosnin/Sicarii`. A read-only check found that its GitHub default branch (`claude/dazzling-gates-83GU4`) currently contains a small ritual/documentation tree, while `main` contains the Scalar application. Inspected application revision: `f773ee94e32406c93b6d51dd408aa40e51938975`; this is source evidence, not a deployed revision.

The inspected Prisma schema represents team workspaces with synthetic User records and TeamMember mappings mirrored from Clerk organizations. `src/lib/server-user.ts` resolves those workspace records from Scalar's own session, `src/lib/api-auth.ts` authenticates account-owned API keys, and `src/lib/credits.ts` implements pooled workspace credits. Existing API keys and credit meters alone do not prove the required Company Human organization/member provisioning, sponsored access or externally enforced policy. The next adapter task must verify Scalar's deployed control API and its account/member mapping before implementing a transport. No Scalar repository, account, billing state or deployment was changed in this inspection.

## Concurrent enable intent — 2026-09-21

A real PostgreSQL regression reproduced a unique-constraint failure when eight enable requests raced for one organization/product/instance key. The service now takes a transaction-scoped advisory lock on that tuple before the existing-row check. Pending intent and its audit entry commit atomically; concurrent callers receive one canonical instance ID. The test uses the restricted `company_human_service` role and also proves tenant denial, separate tenant instances, and rejection of a conflicting instance mode. This fixes pending-intent idempotency only. The durable journal described below subsequently adds persisted retry state; the dispatcher below adds a tested execution boundary; live Scalar lifecycle acceptance remains outstanding in CH-15 and Phase 02.

## Durable initial provision operations

Enablement now atomically records the initial provisionOrganization job for provisioned mode. Server-only helpers claim one operation using row locks and SKIP LOCKED, persist normalized receipts, and reject a completion from an expired/replaced lease. The idempotency key remains unchanged across process recovery. Retries use a 30-second exponential backoff, or a validated adapter retry delay between one second and one day, and stop after five attempts. Pending provider job references survive later transient failures. Audit entries record claims, receipts and crash exhaustion. A completed job receipt alone does not grant application access.

The server-only `dispatchProvisioningOperation` executes one due operation for a trusted product/adapter registration. It requires a separate restricted provisioner login before contacting a provider, rejects incomplete adapter contracts, normalizes transport errors without storing raw exceptions, validates returned results, and uses a 60-second response deadline. A timeout cannot cancel remote effects; retries reuse the same key. A pending result preserves its provider job reference and retries the idempotent provision call. Each real adapter must implement safe repeat/poll semantics; the dispatcher does not invent provider endpoints.

A confirmed active external organization binds its ID and activates the instance atomically with the attempt receipt and audit. Disabled, suspended, expired or retired state refuses activation. No scheduler, production worker credential or real adapter is installed. The actor/tenant scope must come from trusted server identity/job provenance; this function is not a public API. Reconciliation of external success after local revocation/timeouts, connect-existing, membership operations, entitlements and manual retry generations remain separate work.

The Applications admin page exposes setup diagnostics, normalized failures and attempt history. It distinguishes organization connection from member entitlement and live health, and offers a status refresh without initiating provider calls. Manual retry and connection configuration UI are not implemented yet. Enable responses return the instance ID only; status is read from persisted state rather than always reporting pending.

## Member mapping prerequisite — 2026-09-21

The kernel now persists tenant-bound product-membership intent with provider-neutral IDs and restricted provider-result fields. Requesting the mapping does not call Scalar or grant sponsored access. Adapter member dispatch, validated receipts, entitlement/limit application, suspension and offboarding synchronization remain incomplete.

Scalar connection-doctor confirmed an OAuth-capable MCP endpoint at https://www.tryscalar.xyz/api/mcp/mcp?profile=codex on 2026-09-21. Native login reached Scalar's sign-in page but expired without a callback; the stale authorization page was closed. Authenticated tools and account reads are not verified. The source main revision remains f773ee94e32406c93b6d51dd408aa40e51938975. MCP discovery alone does not prove the organization/member control API.

## Durable member lifecycle intent

Provisioning requests now persist an initial member command. Workspace suspension/removal atomically denies mapped product access intent and records a revisioned suspension/removal command, including for members.manage actors without application configuration authority. Actual external state is preserved until an adapter receipt confirms a change. Provider dispatch must reconcile the latest desired revision and avoid executing superseded provision commands. A worker, leases/retries, receipt validation, entitlement enforcement and actual Scalar calls are still required. This command log is not completed external offboarding.

## Product disable intent

The server boundary now disables a product and its enabled member mappings with durable suspension commands and audit in one transaction. Actual provider status remains unchanged until a receipt confirms revocation. New mappings are blocked by the disabled instance, including concurrent insertion. Automatic re-enable is denied pending a reconciled restore path. Applications UI/API wiring, member command dispatch and actual Scalar suspension remain incomplete.

## Applications disable control

The Applications admin page now calls a same-origin POST at `/api/organizations/:organizationId/applications/:instanceId/disable`. The authenticated canonical actor comes from the server; request-body actor fields are ignored. The API acknowledges desiredEnabled=false and remoteRevocationConfirmed=false only after the database transaction commits. The UI confirms scope, explains that existing remote access may continue, supports retry after failure, and identifies the unavailable restore workflow. Remote suspension dispatch and provider receipts remain outstanding.

## Denial dispatcher prerequisite

`dispatchMemberDenial` executes one current suspendMember/removeMember command through a product-bound registered V1 adapter, under a dedicated restricted worker credential. It handles pending, retryable/permanent failure, normalized receipts, stable idempotency, bounded leases/retries and superseded revisions. Suspension accepts suspended/removed; removal accepts removed only. A known external member mismatch fails. Provision/resume and access grants are intentionally outside this denial credential.

Only fixture adapters have been run. No real Scalar call, hosted schedule, production worker login, provider-state projection or reconciled restore is accepted. Late side effects after a timeout/expired lease require provider-aware reconciliation before restoring access; this journal alone does not prove remote revocation.

## Application member administration

Applications now link to a dedicated paginated member-access page. It displays desired access and the latest revision's denial request: queued, running, waiting, failed, superseded or provider-reported success, with bounded attempt history. No older success is substituted for a newer command. The projection excludes provider references, lease tokens and execution-role details. Missing jobs are shown as awaiting worker; no optimistic remote success is invented.

Fresh connection checks on 2026-09-21 using updated Scalar/Symbolic plugin packages still found Scalar OAuth login available but no authenticated read, and Symbolic HTTP 401 without OAuth discovery. A fresh native Scalar consent flow was opened; account sign-in is pending. No product connection acceptance is inferred.

## Adapter execution audit

The denial dispatch journal is now accompanied by central audit events attributed to the member lifecycle service, distinct from the human who requested the command. Claims and normalized receipts are recorded atomically with job transitions; audit-write failure leaves completion uncommitted. The Audit page displays actor type and service identity instead of attributing background work to an unknown or suspended human. Real adapter execution remains unverified.

The native Scalar OAuth attempt opened during the connector refresh expired without a callback. Its stale tab was closed. No grant or authenticated read was obtained; a fresh consent flow is required when the account owner is available.

## Entitlement preparation

Organization defaults and member overrides now have versioned desired-policy storage. No Scalar transport applies these settings yet; no provider receipt, member grant or usage limit is implied. Administration UI/API, effective resolution and adapter enforcement remain outstanding.

## Entitlement settings interface

Admins can now configure organization defaults and mapped-member overrides in a dedicated page. This changes desired policy only. No Scalar adapter applies the settings yet; actual capabilities and usage limits remain unverified.

## Suspended member provisioning contract v2 — 2026-09-21

Added a separate version 2 adapter interface requiring explicit suspended creation and a strict suspended success receipt. V1 remains unchanged for existing organization/denial operations and cannot pass V2 registration validation. Normalized incompatibility, typed tenant/member input, bounded retries and strict response schemas are covered. The documented compatibility window and migration sequence precede any worker/provider rollout.

No remote calls, worker, schema migration or access grant are introduced. Scalar must prove initial denial and later entitlement/budget/readback gates before this can establish usable access. The new contract tests do not prove remote enforcement.

## Suspended member bootstrap execution — 2026-09-21

dispatchMemberBootstrap now executes a single provisionMember command through a complete product-bound V2 registration, using a restricted durable journal. It sends initialAccess=suspended and rejects an active success response. Existing V1 organization/denial workers are unchanged. No real Scalar adapter, worker registration/schedule, access grant, entitlement/limit application or resume is included. A persisted suspended receipt is a prerequisite to subsequent orchestration, not provider lifecycle acceptance.

## Suspended identity projection — 2026-09-21

The bootstrap completion transaction now projects a valid current suspended receipt into the canonical product membership through a narrowly privileged function. It records an immutable attempt reference and a service audit event. Conflicts retain the receipt and fail the job for reconciliation. Superseded work cannot overwrite the mapping. This makes the external identity available to later policy and denial handling; effective policy, limits, readback, resume and real Scalar transport remain outstanding.

## Finite usage limit preparation

Finite product/member meter policies are now persisted as configuration intent. Existing adapter limit dictionaries do not establish unit, window, revision or readback semantics. That gap is documented in usage-limit-semantics.md; no guessed Scalar conversion or provider acknowledgement is introduced. Actual adapter application and usage enforcement remain outstanding.

## Exact usage limit adapter extension

ProductUsageLimitAdapterV1 extends V2 with usageLimitContractVersion=1, applyUsageLimit and getUsageLimitState. Requests/receipts identify exact persisted policy revisions and verified external targets. Organization caps cover aggregate usage; revision updates preserve counters and suspension. Strict schemas and readback matching are implemented; provider semantics still need live verification. Legacy applyLimits dictionaries remain available only for existing callers, and cannot satisfy this extension. See [semantics and compatibility](usage-limit-semantics.md). No executor or provider implementation is registered yet.

Saved usage-limit revisions now enqueue durable jobs atomically. The journal supports future leases, bounded attempts and immutable apply/readback receipts. The restricted dispatcher now consumes it in tests, while production transport and scheduling remain unconfigured; queued configuration must not be displayed as applied or enforced. Superseded revisions must be rejected by the future executor before provider calls and at completion.

## Restricted exact-limit execution

The usage-limit dispatcher now consumes durable jobs through ProductUsageLimitAdapterV1, applies one current revision and separately reads back exact scope/target/quantity/unit/window/revision. Two-minute leases, stable idempotency, five attempts, bounded deadlines, normalized errors, immutable receipts and service audits are implemented. Provider bindings are required; superseded work is retained without granting access. Only fixture adapters are registered in tests. No real Scalar transport, production worker login or schedule exists. All applicable limits, effective entitlements, provider freshness and revoked intent must still be checked by a future activation path. Adapters must reject stale revisions and preserve usage counters even when a timed-out request finishes late.

Usage-limit administration now displays current-revision delivery status and attempt history, including retry timing and failures. It identifies successful readback as historical provider reporting for that individual limit. It neither grants member access nor asserts complete policy enforcement. Refreshing status does not retry failed provider operations.

## Connect existing organization orchestration

requestProductConnection records an immutable candidate for a catalog-supported connected instance. The existing organization dispatcher now selects connectOrganization or provisionOrganization by persisted intent/mode; connection success must exactly match the candidate. The limited activation owner binds it only with valid lease, current authorization and eligible instance. This implements shared orchestration with fixture proof, not real Scalar ownership verification. A real adapter must use the sponsoring organization's authorized provider connection and verify authority; an administrator-supplied external ID alone is insufficient. Public connection API/UI, actual transport, hosted execution and connection-specific reconciliation remain unfinished.

The organization dispatcher now retains a valid in-flight provider result after administrator revocation, instance disable or catalog retirement. It refuses activation, marks activation_denied_reconciliation_required and preserves the provider reference for subsequent reconciliation. Execution audit identifies organization-provisioner rather than impersonating the initiating human. This does not implement remote cleanup or reconciliation; those remain required before hosted operation.

## Suspended capability staging contract

ProductCapabilityAdapterV1 extends member-safe V2 with complete capability staging and independent readback. Strict request/result schemas bind organization, instance, membership, both external identities, complete-set policy revision, replace_all semantics and suspended member access. Receipt comparison rejects additional/missing capabilities and mismatched targets/revisions; order is normalized and duplicates rejected. Legacy applyEntitlements cannot satisfy this contract.

resolveRequestedCapabilities validates one current revision per organization/member capability, rejects mixed scopes and ambiguous snapshots, applies explicit deny precedence and limits output to the current catalog. It resolves desired configuration only. Commercial plan, role/team, budget, compliance, health, suspension and current identity checks remain mandatory before effective access. Durable snapshot issuance, restricted execution, provider transport and activation integration are not implemented by this contract.

Durable capability snapshot preparation is now available as a server-only database service. It derives the complete requested capability set for a bound suspended member, persists source provenance, deduplicates unchanged refreshes and emits atomic human audit. Migration 0039 now enqueues staging work atomically; preparation itself does not call the provider, automatically refresh on every policy/catalog change or resume members. The restricted worker described below revalidates snapshots and retains apply/readback receipts. A separate activation decision remains required.

## Capability staging execution

The restricted capability worker stages the full saved set, independently reads provider state and requires exact capability/target/revision/suspension agreement. It uses stable keys, two-minute leases, at most five attempts, bounded backoff, a combined 60-second call deadline, normalized failure codes and atomic service audit. Successful staging remains recorded if readback fails or times out. Late promises cannot rewrite persisted receipt variables; remote effects still require idempotency and reconciliation.

Source freshness is checked against current canonical preferences/catalog/bindings at claim and completion. Superseded results remain historical; the worker never resumes a member. Provider fixtures exercise this orchestration. Real Scalar transport, production execution credentials/scheduling, automatic snapshot refresh, retry administration, full runtime entitlement gates and activation remain incomplete.

Member entitlement administration now shows latest capability snapshot delivery, source/eligibility freshness and bounded attempt history. Refresh requests fresh server data; it does not retry operations or grant access. A successful preference save immediately clears the prior delivery display until refreshed state arrives. Capability and usage-limit diagnostics share the existing presentation primitives. Automatic snapshot refresh, operator retry and final activation remain separate unfinished work.

## Automatic snapshot refresh boundary

refreshCapabilitySnapshots provides a bounded tenant/product scan for a trusted scheduler. It uses keyset pagination (default 25, maximum 50), returns scanned/prepared/reused/skipped counts and a next cursor, and refreshes changed preference/catalog/target sources under per-member locks. Unchanged sources reuse history; new snapshots atomically queue staging. No provider call occurs during preparation.

A scheduler must exhaust the returned cursor, then repeat from null so new or previously skipped members are reconsidered. Page failures can be retried safely; earlier committed work is deduplicated. No production preparer credential or schedule is configured yet. This covers initial bound suspended members, not active-member access changes, remote drift reconciliation or final activation.

## Scalar control contract audit — 2026-09-21

Read-only review of Scalar main at f773ee94e32406c93b6d51dd408aa40e51938975 found concrete missing sponsored-control guarantees: suspended membership state, verified Convex-to-Scalar identity/launch, revisioned capability and hierarchical-limit enforcement, pre-cost reservations and durable actor-attributed usage. See [source evidence and required provider work](scalar-control-assessment.md). Current pooled credits and Clerk membership mirrors do not satisfy these guarantees. No provider mutation or live acceptance was performed; Phase 02/03 remain open. The next independent application task is the authorized connect-existing intent UI, without claiming ownership or access from an external ID.

## Connected intent administration — 2026-09-21

The pending connected-instance form and authenticated POST connection endpoint now expose requestProductConnection. Submission records intent and reports providerConnectionConfirmed=false; product authorization, ownership verification and actual transport remain required. See the current [implementation evidence](implementation-status.md).

## Catalog setup entry — 2026-09-21

An administration-scoped catalog now exposes supported create/connect organization modes for ready valid registrations. The public setup endpoint uses a catalog-validated service, records pending intent only and normalizes conflicts. Draft integrations remain visible but unavailable. No reference registration, provider credential or live access was changed. Complete permission/data-use and cost disclosures, authenticated provider connection and real acceptance remain required.

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

## Contributor apps — 2026-09-22

The contributor Apps page displays own organization-sponsored assignments. Provider launch remains unavailable until authenticated identity, current permissions/limits and actual adapter activation are verified.
