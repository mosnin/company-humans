# Architecture

Company Human is a separate product. The code contains a Next.js web app with API routes and shared contract and database packages. The web visual primitives come from Company OS Web. The implemented identity slice maps Convex OAuth identities to canonical users, offers an organization creation route and selector form, stores organizations, memberships, roles, teams, invitations, and audit records in Postgres, and resolves tenant access through a restricted RLS login. The control plane now stores catalog entries and organization product enable intent. External product provisioning, usage, billing, human work, CRM, attribution, payout, and the remaining planes are not implemented. Specialized products remain independent sources of truth.

See [migration assessment](migration-assessment.md) for the source audit and recorded scaffold boundaries and authentication override.

Phase 00 defines a version 1 product adapter interface plus version 1 event and audit envelopes in `@company-human/contracts`. Both carry canonical organization IDs and actor provenance. The server only signing subpath uses domain separated HMAC SHA-256 with stable JSON ordering and constant time comparison. Identity audit envelopes are persisted transactionally. Event ingestion, replay, key management, and stronger audit immutability remain later work.

Identity administration uses server-rendered routes under `/workspace` with request-scoped membership resolution. People, Teams, and Permissions invoke narrow audited APIs; navigation visibility reflects capabilities but is not an access control. The browser test harness is separate from Next app routes.

## Identity audit reader

Migration 0017 permits scoped audit reads through the service role only with audit.read.all. The `/workspace/audit` page shows paginated identity events, actor names, timestamps, targets, and before/after state. It cannot modify history. Restricted-role tests cover allowed owner reads, contributor denial, cross-tenant denial, and continued denial of audit updates.

## Authentication override

The product owner's 2026-09-20 direction replaces Clerk with Convex Auth. Convex stores OAuth account/session data; PostgreSQL retains canonical users and tenant authorization. The server queries the authenticated Convex identity, including current session existence and expiry, before resolving the canonical issuer/subject mapping. A same-origin POST synchronizes that profile after sign-in; GET requests do not create users. The user migration preserves legacy mappings and canonical IDs without linking by email. See [authentication setup](authentication.md).

## Member denial execution

The database package now exposes a bounded server-only denial dispatcher using a distinct restricted worker role, immutable command provenance and durable attempt journals. It can execute only suspension/removal through an explicitly registered product adapter and does not depend on the initiating human remaining active. No hosted worker process or real adapter is installed. This is a verified execution boundary with fixtures, not production remote offboarding.

## Entitlement intent prerequisite

Versioned organization/member capability configuration is stored in PostgreSQL and exposed through a scoped server boundary. Policy intent is separate from the future effective authorization resolver and remote adapter application. No route, worker or product launcher treats a saved allow as access.

## Suspended member binding

Member creation now has two verified kernel boundaries: the restricted V2 execution journal and an audited database function that projects a successful current receipt into a suspended canonical mapping. The function uses a dedicated minimal owner role; the worker can invoke it but cannot directly edit mapping state. Receipt and audit provenance stay atomic. Product activation remains a separate unfinished boundary requiring current policy, finite limits and provider readback.

## Health collection

The restricted health collector records each provider check independently from provisioning state. Latest-started observations are projected for admins with a five-minute monitoring freshness window; failed checks remain visible. This is monitoring only. The permission-scoped admin status interface shows saved observations, freshness and failures. Scheduling and real adapter health verification remain incomplete.

## Access policy safety

Entitlement and finite-limit revisions invalidate bound member access transactionally, while preserving intended assignments for a later authorized activation. Existing durable denial jobs carry monotonic access revisions. Provider state is projected only from full current fenced receipts, independently of local intent. Preparation checks product.use and every catalog-required grant on the target's tenant role without impersonating that member. Role, organization and catalog denial intent are implemented; delivery to real providers remains unfinished. No app launch is enabled by these preparations.

The server-only activation readiness diagnostic reads a repeatable tenant-scoped snapshot under both applications.manage and budgets.manage. It reports suspended binding provenance, current capability and finite-limit delivery receipts, unresolved denial, and current authorization reasons. It never returns ready because the catalog lacks a verified provider meter/unit/window enforcement contract. The later grant worker must revalidate every input under a durable access fence and read back actual provider state; this diagnostic is not an access decision.

A shared version 1 meter enforcement declaration schema now describes a product's claimed variable-cost meter versions, units, aggregation, UTC windows and organization/member hard-stop scopes. It has no persistence or provider-verification flag. Existing V1 finite-limit policies and receipts carry no meter version, so declaration validation cannot establish limit coverage or change activation readiness.

An additive V2 usage-limit adapter contract carries `meterVersion` through policy, request, successful provider state and exact readback matching. It rejects V1-only registrations for V2 calls. No storage, worker, provider registration or access decision consumes this contract yet; versioned readback alone cannot prove a hard stop before cost.

The additive revision-storage migration now preserves V1 history with an explicit contract version and reserves a positive meter-version field for V2. It prevents V2 revisions from entering the V1 dispatch journal or being interpreted by the V1 worker. A V2 write and delivery path remains absent, so the activation gate is unchanged.

A restricted operator comparison can now check one shaped meter declaration against the product's current ready catalog revision, exact catalog meter key set and immutable registered meter version/unit/aggregation. It runs within a caller-owned repeatable-read transaction and records no provider proof. A compatible local registry is insufficient to establish exhaustive variable-cost coverage or before-cost enforcement; activation remains closed.

Role-policy edits and membership role changes serialize through an organization authorization lock. Grant writes retain unchanged rows. Permission loss emits durable denial with authorization provenance, and an owner-only reconciliation covers preexisting gaps. Remote effects still require provider delivery/readback; restoring a role grant alone never activates access.

## Organization suspension access invalidation

A sponsoring organization's active-to-suspended or active-to-closed status transition now appends fenced denial intent for each bound desired member mapping in the same transaction. It preserves assignment and provider state, requiring the member denial worker's exact readback to record remote suspension. No automatic access restoration occurs when the organization becomes active again. Organization lifecycle APIs and real provider suspension remain separate work.

## Catalog access changes

An access-relevant product catalog edit or retirement now appends a fenced denial for each existing bound desired member mapping across organizations in the same database transaction. Cosmetic catalog edits leave access revisions alone. The denial uses the same worker journal and cannot project a provider suspension from a compact receipt. Pending suspended-member bootstrap commands carry a database-stamped catalog revision. Binding and catalog changes share an advisory lock; when the command is stale, binding retains the suspended identity and atomically queues a single fenced denial for that mapping. A draft catalog entry cannot bind a new member. Required role-permission changes use a tenant authorization lock and a shared predicate; binding checks current requirements after taking that lock. No product activation is enabled by these preparations.

The suspended-member bootstrap worker checks the current ready catalog, target role requirements and policy block before it calls a provider. It rechecks them when the result arrives. A result from an ineligible in-flight call remains in immutable attempt/job history but does not bind a canonical member identity. Reconciliation of any remote identity created during that call is still required; activation remains closed.

## Member request eligibility

Migration 0064 makes new organization-sponsored member intent conditional on a ready product with structurally valid catalog metadata, an instance mode listed by that product and support for `provision`, an active organization, requesting administrator and target member, and every required grant on the target member's current tenant role. The restricted service checks this before creating the mapping, and a restrictive PostgreSQL insert policy independently rejects direct service SQL. Catalog, organization authorization, organization status and member lifecycle edits share ordered locks with inserts; eligibility is re-read after lock waits. An existing blocked or disabled mapping requires explicit reconciliation. The admin candidate list projects the same eligibility boundary. A successful request still records pending intent only; no connected product access follows from it.
