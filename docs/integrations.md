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
