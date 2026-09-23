# Security

## Identity and tenant boundary

Convex Auth handles OAuth sessions. Company Human owns canonical users, memberships, tenant policy and authorization. Google must report a verified email. Email magic links require a matching email and token, expire after 15 minutes, and use a confirmation page before redemption. Unredeemed email requests cannot produce a verified identity. Accounts are never merged automatically by matching email. Canonical identities are keyed by issuer and subject, retaining provider event ordering and deleted-user tombstones.

Each request queries Convex with its session token and checks the current session record, ownership and expiration. A revoked session or deleted authentication user is denied even if the JWT has not expired. The canonical sync endpoint accepts only same-origin POST and ignores client identity fields. Invitation redemption uses the authenticated provider's verified email and checks it again against canonical user and invitation in PostgreSQL. Provider verification reflects the latest successful OAuth sign-in; it does not poll Google on every request.

The selected organization cookie is a preference only. Server-rendered workspace pages and APIs resolve active membership on each request. Navigation visibility is never an authorization boundary. Deleted users, suspended/removed memberships, and inactive organizations cannot resolve tenant access.

## Database credentials

- `DATABASE_URL`: migration owner; isolated integration-test fixture setup. Never a web runtime credential.
- `DATABASE_RUNTIME_URL`: separate login granted `company_human_app`; tenant reads under RLS.
- `DATABASE_SERVICE_URL`: separate login granted `company_human_service`; scoped identity mutations and administrative reads.
- `DATABASE_IDENTITY_URL`: separate login granted `company_human_identity`; canonical OAuth identity synchronization only.

Outside isolated tests, write helpers reject a superuser, BYPASSRLS role, migration/table owner or inherited table-owner role. Tenant read helpers enforce this in all environments. All credentials are server-only. Holders of database credentials can set request context, so they remain trusted infrastructure; verified identity must supply actor context, never request body fields.

## Capability enforcement

Server services consult persisted role grants. Restrictive database policies independently check operation capabilities. Organization bootstrap can create only initial owner identity and default grants. Invitation identity must match its one-use token, role and verified recipient. Contributor SQL cannot edit organization settings, promote its membership, assign manager authority, insert grants or activate product instances. General mutation credentials cannot rewrite tenant identity, organization ownership or provider fields.

Permission edits require `roles.manage`, protect the Owner policy and actor's own role, and forbid granting capabilities the actor lacks. An Admin cannot edit the Admin policy. Concurrent edits require the previously observed grant set; stale edits return a conflict. Optional membership permission overrides are not implemented.

## Audit and lifecycle

Identity services append versioned audit events in the same transaction as mutation, including before/after state. Runtime roles cannot update or delete audit history. Audit reads require `audit.read.all` and organization scope. Migration operators retain privileged maintenance authority; backups, external tamper evidence and operator audit are later reliability work.

Invitations use random tokens stored only as hashes. Unavailable, expired, consumed and wrong-recipient attempts return a generic unavailable result. The browser removes the token from the URL, preserves it in tab storage for at most 30 minutes, and clears it on acceptance. The sign-in return target passes through `/auth/complete` to the fixed `/invite` route. Admins share the generated link manually; the application does not claim to send email.

Suspension/removal blocks Company Human access. Removal ends team grants and revokes pending invitations without deleting membership or audit history. Reinvitation does not restore ended team assignments. The Convex session-revocation read check is covered by backend tests; live OAuth round-trip and connected-product offboarding are not demonstrated; no connected product access is active yet.

## Remaining production gates

Live Convex OAuth configuration/round-trip, deployed restricted roles, authenticated browser acceptance, API rate limits, expanded authorization coverage, adapter credentials, event replay, signing-key management, privacy review, penetration testing and disaster recovery remain. No usage billing, commissions or payout execution exists yet. Contract signing tests are not proof of a production event ingestion service.

## Provisioning journal boundary

Operations and attempt history use RLS requiring applications.manage in the explicit tenant context; ordinary contributor/read credentials receive no grants. Composite foreign keys prevent cross-tenant instance/operation references. Service column grants prevent rewriting operation identity or attempt ownership. Completed attempts are immutable; deletion is unavailable to runtime roles. Claim and completion independently recheck active identity, organization, membership and capability. Leases fence stale workers; they do not cancel external side effects, so provider idempotency/reconciliation remains mandatory before dispatch. No public worker endpoint or provider credential store is introduced.

## Provisioner activation (0020–0021)

`company_human_provisioner` has journal, product-read and provisioning-audit privileges; it is not a member of the general service role and cannot update memberships, grants or raw instances. Only this runtime role can execute `activate_provisioned_instance`. Its dedicated function owner (`company_human_activation`) is NOLOGIN, NOSUPERUSER and NOBYPASSRLS, with narrow column grants and tenant/capability policies. The function checks a live matching lease, current actor authority, desired enablement, provisioned mode, pending state, unset external ID and non-retired catalog entry under row locks. Receipt failure rolls activation back. No web route accepts provider receipts from clients.

External effects that occur before local revocation remain a reconciliation/offboarding requirement. Rejection of local activation does not prove the provider cancelled its resource; the failed transaction leaves the journal available for investigation. No production worker login or credential has been created by these migrations.

Applications diagnostics are restricted by applications.manage both in server page checks and the database service query/RLS. The projection excludes provider references, leases and raw payloads. Browser enable mutations require an exact same-origin Origin header; user identity remains server-derived.

## Browser mutation origin checks — 2026-09-21

All twelve cookie-authenticated POST/PUT/PATCH handlers reject absent, null or foreign Origin before identity resolution or database work. The shared guard compares the exact scheme and destination Host, including port; client-supplied X-Forwarded-Host cannot expand the allowlist. Using Host preserves the browser-facing authority when Next's proxy normalizes its internal URL hostname. Deployments must preserve the original destination Host and protocol. Legitimate same-origin requests still require OAuth and tenant authorization; Origin is not authentication.

A regression run initially failed ten of twelve route boundary scenarios. After the repair, all twelve deny wrong origins before auth, and a proxy-normalization case denies forwarded-host spoofing. A real production-build HTTP check confirms missing/foreign Origin returns 403 and valid local Origin reaches the unconfigured-authentication 503 boundary for each route. No OAuth callback, webhook or signed machine API was changed; future integration endpoints must use their own signature/API-key boundaries. See [runtime evidence](execution/origin-runtime-evidence.json).

## Invitation cancellation

Invitation history requires members.manage, tenant-scoped database context and explicit token-free projection. Revocation requires same-origin DELETE and a server-derived canonical actor; database capability policies independently restrict updates. Acceptance and revocation serialize on the invitation row. Revoked links fail acceptance; repeated revocation is harmless and writes one audit entry. Accepted invitations cannot be revoked retroactively: use membership suspension/removal to disable access.

## Product mapping offboarding

Membership suspension/removal disables product mapping intent, records a durable provider command, and appends audit in one transaction. Provider state is not rewritten to imply remote success. Transaction locks prevent new mapping inserts from racing beyond parent suspension; they preserve existing owner-protection policies. Command insertion failure rolls back membership and mapping updates. Workspace reactivation and reinvitation do not restore product mappings. External token/session revocation remains an adapter acceptance requirement.

## Application disable and insertion fencing

The server disable transaction requires applications.manage and tenant scope; cross-organization identifiers are unavailable. Product-member insertion locks and checks its instance before inserting, preventing enabled child intent after a concurrent product disable. Migration 0026 allows denial of active instances while preserving provider status and forbids general-service provider-state mutation or re-enablement. Existing activation receipt checks still reject disabled instances. No public disable endpoint or remote revocation proof is introduced by this increment.

## Disable endpoint authorization

The application-disable POST is the fourteenth browser mutation handler covered by the origin-denial suite. It checks origin before authentication, validates URL organization/instance IDs, and uses server-derived identity with the restricted database service. Permission/unavailable-object errors expose no tenant detail; other failures return a generic retryable 503. A successful response is not a provider revocation receipt.

## Denial worker credential

Migration 0027 adds NOLOGIN `company_human_member_worker`. Its execution login must be non-owner, non-superuser, non-RLS-bypass and not a member of the ordinary application service role. Trusted server code supplies the organization scope; RLS restricts reads/jobs/attempts to it. No public endpoint accepts a caller-provided worker scope. The credential reads persisted denial commands and writes execution journals only; it cannot insert commands, update mappings/users/memberships or grant access. Web service credentials cannot execute this worker. No production login or scheduler has been installed.

Persisted denial continues after the initiating human loses membership, because it cannot increase access. Known external member IDs must match successful provider receipts; active provider status cannot satisfy suspension, and removal requires removed status. Raw provider exceptions are replaced with controlled codes. A 60-second response deadline does not cancel remote side effects: provider idempotency and later reconciliation remain required.

## Application member diagnostics

The server page and database read both require applications.manage. Instance IDs are canonical and bound to the selected organization; cross-organization instances are denied even when the same user owns both organizations. Current command revision and tenant identities are included in every join. The explicit projection omits lease tokens, external member/operation references and worker roles; revoked administrators cannot read it.

## Service audit attribution

The denial worker may append only its named service actor, approved member-denial actions and a tenant-bound suspension/removal command target. It cannot masquerade as a human or another service. Existing service write policies still require human actor identity for human mutations. Completed audit history remains append-only to runtime roles. Audit insertion failure rolls back the worker job and receipt transaction.

## Entitlement configuration boundary

setProductEntitlement requires applications.manage and validates tenant instance/member identity. RLS and composite references protect both policy and revision tables. Unsupported or retired capabilities cannot receive allow through this boundary; deny/inherit remain available. Runtime mutation permissions are append-only. These are desired settings, not usable access: product state, membership, roles/team scope, budgets, health and compliance still need the effective resolver and provider enforcement.

## Entitlement mutation API — 2026-09-21

POST /api/organizations/[organizationId]/applications/[instanceId]/entitlements binds the authenticated actor and URL scope, rejects unknown body fields and foreign/missing Origin, and calls the audited applications.manage boundary. Stale revisions return 409; unavailable capabilities return 422; tenant/permission denial returns 403; infrastructure errors are normalized. Success returns the saved revision with providerAccessConfirmed=false and no-store.

All 92 automated tests, typecheck, lint and production build pass. Local production-server HTTP checks return 403 for missing/foreign Origin and 503 Identity unavailable for valid Origin with the current unconfigured local identity. Authenticated handler tests use explicit identity/database mocks; actual OAuth remains unverified. No UI, effective authorization, provider grant or usage enforcement is added by this endpoint. After verification, generated .next output was removed to recover disk space; source and evidence were preserved.

## Scoped entitlement administration reads — 2026-09-21

readApplicationEntitlements requires applications.manage and validates the tenant instance and optional member before returning desired settings. It includes supported capabilities plus historical settings, current selected revision, organization/member effects, deny-precedence result and catalog availability. An explicit providerAccessConfirmed=false prevents interpreting this configuration projection as a provider grant. Retired capabilities remain visible for denial/history.

All 92 automated tests, typecheck, lint and build pass. The expanded restricted-role scenario also passes on hosted verification PostgreSQL: organization denial overrides member allow, default/member revision selection is correct, foreign actor/member/instance reads fail, and retired capability settings remain visible but cannot be allowed. No migration or UI changed. Administration screens, actual OAuth and Scalar enforcement remain outstanding. Prior entitlement storage commit 9f4ea3d passed CI 35641383327.

## Member access request endpoint — 2026-09-21

POST /api/organizations/[organizationId]/applications/[instanceId]/members accepts a canonical membership ID and binds the actor and tenant scope on the server. It rejects missing/foreign Origin and forged extra fields, uses the audited idempotent mapping boundary and returns 202 with providerAccessConfirmed=false. Previously denied mappings require reconciliation (409); unavailable member/product or authorization returns 403; infrastructure details are normalized.

Verified: 109 automated tests (11 contracts, 17 database, 81 web), typecheck, lint and build. Local production-server HTTP rejects missing/foreign Origin and fails closed with Identity unavailable for valid Origin. Authenticated handler cases are explicitly mocked; real OAuth and Scalar provisioning remain unverified. No migration or UI changed. This endpoint records intent; it does not dispatch provisionMember or bypass the documented bootstrap-denial requirement.

## Member access selection UI — 2026-09-21

Admins can open a dedicated member request page from application member diagnostics. A scoped applications.manage query returns active, unmapped members by name, with 50-row pagination and search; it excludes existing mappings so denied access cannot be restored through a fresh request. Unavailable product connections and unauthorized/foreign instances fail closed. The page reuses the inherited table, controls and buttons and states that provisioning/access policies must be confirmed before access.

Verified: 109 automated tests, typecheck, lint, build and 44 explicit-fixture desktop/mobile checks. The expanded restricted-role selection/mapping scenario also passes on hosted verification PostgreSQL. Tests cover scoped results, search, pagination, foreign actors/instances, exclusion after mapping and disabled instance availability. Browser tests verify request/retry, selected member ID, empty eligibility and unconfirmed-access feedback; mobile screenshot inspected without page overflow. Real OAuth, provider lifecycle, effective entitlements and budgets remain unverified. No migration required.

Symbolic native OAuth session expired without callback; its obsolete sign-in tab was closed. OAuth discovery remains available, but authenticated Context/Flow remains unverified. Prior endpoint commit 414b5e3 passed CI 35643239508.

## Suspended member bootstrap credential

Migration 0030 creates a separate NOLOGIN company_human_bootstrap_worker role. The execution login must be non-owner, non-superuser, non-RLS-bypass and separate from the general service role. Tenant-scoped reads cover only provisionMember commands, mappings, instances and the minimal identity columns needed to check active user/member/organization state. It cannot alter identity, mappings, entitlement policies or grant access. No production execution login or scheduler is installed.

The V2 dispatcher requests suspended creation only. It rechecks current intent and target liveness at claim and completion; a revoked target's receipt is retained as superseded. Audit and journal changes commit together. Provider exceptions are normalized. Expired leases cannot complete, retries use the same provider key and stop after five attempts. Timeouts do not cancel remote effects; reconciliation of late effects remains required before activation or complete offboarding can be accepted.

## Suspended mapping projection boundary

Migration 0031 owns bind_suspended_product_member with a dedicated NOLOGIN, non-superuser, non-RLS-bypass role. Workers cannot assume that role or directly update mappings. Only the bootstrap worker receives EXECUTE; general web credentials are denied. The function derives the provider identity from the current lease's completed successful attempt, rechecks tenant/current intent and target liveness, locks the mapping and allows suspended projection only. Active/removed mappings and different existing provider identities cannot be replaced. A duplicate external identity within an instance is refused.

Binding inserts its own service audit event inside the database function, so even direct function invocation cannot omit that event. Raw provider identity is absent from the audit payload. Audit failure rolls back the mapping, receipt and job transaction. There is no active grant, entitlement mutation or permission to re-enable a mapping.

## Finite usage limit configuration

setProductUsageLimit and both limit tables require budgets.manage. Scope and actor come from trusted server context; composite tenant references reject foreign instances/members. The service may read product instances under budgets.manage for this configuration. Units are immutable across scopes, revisions are consecutive, quantities are nonnegative and finite with at most six fractional digits, and runtime history cannot be rewritten. Edits use optimistic revision checks and an atomic human audit. Known historical meters may be set to zero when catalog metadata disappears or the product retires; new/nonzero configuration requires a supported catalog meter. No public mutation endpoint, provider application or spend authorization is added.

## Usage limit mutation API — 2026-09-21

POST /api/organizations/[organizationId]/applications/[instanceId]/usage-limits now saves finite limit intent through the audited budgets.manage boundary. It derives actor and tenant scope on the server, checks same-origin before identity, rejects forged/unknown fields and preserves exact decimal quantities. Stale revisions return 409; unavailable meters or changed units return 422; tenant/permission denial returns 403; infrastructure failures are normalized. Success returns the saved revision with providerEnforcementConfirmed=false and no-store.

All 157 automated tests (17 contracts, 19 database, 121 web), typecheck, lint and production build pass. Live local HTTP returns 403 for missing/foreign Origin and 503 Identity unavailable for valid Origin under the current local configuration. Authenticated route cases use explicit identity/database fixtures; actual OAuth remains unverified. No migration or UI changed. Scoped read/UI, effective hierarchy, metering and Scalar enforcement remain incomplete. Prior storage commit fc7f09d passed CI run 35646817432.

## Scoped usage limit administration reads — 2026-09-21

readApplicationUsageLimits requires budgets.manage and validates tenant instance/member identity. It returns current exact quantities/revisions for the selected scope, separate organization/member caps, immutable unit metadata, explicit UTC windows and catalog availability. Null is unconfigured, not unlimited. Historical settings remain visible after catalog retirement or metadata loss; nonzero configuration is then unavailable. No effective allowance, remaining balance or provider enforcement is inferred.

All 157 automated tests, typecheck, lint and production build pass. The expanded restricted-role scenario covers current revision selection, exact decimal preservation, unconfigured versus zero, organization/member separation, historical settings, foreign actor/instance/member denial and missing-budget-permission denial. No migration or UI changed. Actual OAuth, provider application, usage aggregation and Scalar enforcement remain outstanding.

## Usage-limit journal boundary

The web service has only scoped SELECT and column-specific INSERT of organization/limit/revision into usage_limit_jobs. Default state is pending. It cannot UPDATE/DELETE jobs, INSERT attempts, or fabricate execution status. Both tables enforce RLS and composite tenant references. The enqueue trigger uses invoker rights. Attempt updates cannot alter provenance and cannot modify completed history. Migration 0034 and the dispatcher add restricted execution as described below; production worker credentials remain unconfigured.

## Usage-limit worker isolation

Migration 0034 grants company_human_limit_worker journal-only mutations, tenant/product-scoped policy and mapping reads, minimal identity columns and service-attributed audit inserts. Runtime checks reject superusers, RLS-bypass roles, table owners and general web service credentials. RLS constrains job, attempt, policy and product-instance visibility through both organization and product scope. The role cannot edit identity, limits, product access or audit history. It is NOLOGIN; no production execution credential has been issued. A successful single-limit receipt cannot authorize activation.

Usage-limit administration diagnostics require budgets.manage and return only current-revision job status plus bounded attempt timestamps/outcomes. The projection excludes external identities, lease tokens, worker roles and raw apply/readback receipts. Parent and selected member data are projected separately; no other member's delivery is returned. Existing cross-tenant and missing-capability denial remains enforced by server and database.

## Existing organization connection boundary

Candidate provider IDs are untrusted intent. requestProductConnection requires applications.manage and a scoped pending connected instance with declared catalog support. Immutable target, exact receipt comparison and the restricted SQL activation function prevent substitution between request and receipt. Web credentials cannot bind targets. The real adapter must independently verify the actor/organization's remote authority through its tenant-authorized connection before returning success. No real provider proof or public ID-based connection endpoint is present.

## Provisioning receipts after authority revocation

Migration 0036 permits the restricted provisioner to retain tenant-scoped in-flight receipts after the initiating human loses applications.manage. New claims still require current authority. Completion requires the running unexpired lease and original initiating user; activation retains its separate current-authorization and eligible-instance checks. Expected activation denial records a failed operation requiring reconciliation while preserving the actual provider outcome/reference in immutable attempt history. Worker events use service actor organization-provisioner with initiatingUserId context. Runtime worker checks exclude general web-service credentials. No hosted execution login is created.

## Database initiating-authority enforcement

Migration 0037 makes both privileged organization activation functions independently require the immutable initiating user of the current unfinished attempt, matching tenant, operation, attempt number and lease. An otherwise authorized replacement administrator cannot activate a lease claimed by a now-suspended administrator. The limited activation owner receives only scoped attempt reads; execution grants, owner isolation and existing capability/instance checks remain in place. This protects direct worker SQL calls as well as the TypeScript completion boundary.

## Capability snapshot preparation

prepareMemberCapabilitySnapshot requires applications.manage under the restricted service context. It accepts a canonical product-membership ID, derives tenant/member/instance/provider identities from scoped database rows, and only prepares a bound suspended membership with active organization/user/member and enabled active instance. One SQL statement reads eligibility, catalog and latest preferences consistently after serialized issuance. Identical source state reuses the previous revision. History insertion and human audit are atomic.

Snapshot tables enforce tenant RLS, composite references, actor attribution, monotonic revisions and no runtime UPDATE/DELETE privileges. Snapshots are admin-controlled desired intent; they cannot authorize product usage. The future execution/activation path must independently re-read and compare current source state and all runtime gates. Captured eligibility can change after preparation, and a snapshot is not a reservation or provider acknowledgement.

## Restricted capability execution

company_human_capability_worker is a separate NOLOGIN role with tenant/product-scoped snapshot, policy, binding and minimal identity reads. Runtime checks reject owner, superuser, bypass-RLS and general web-service credentials. It receives journal mutations and constrained capability-worker audit inserts, with no permission to grant access, change preferences or rewrite completed receipts.

Claim and completion independently recompute current source inputs rather than trusting an admin-controlled snapshot payload. They compare the complete source and capability set, latest snapshot, live bound identities, desired membership revision and suspended/active eligibility. Changed preferences invalidate work even without a newer snapshot. Per-member issuance locking prevents completing against a concurrently issued newer snapshot; policy can change after a read, so historical success never replaces the separate final activation check. Remote products must enforce stale revision rejection and preserve suspension. No execution login or production scheduler is configured.

Capability staging diagnostics require applications.manage and a validated tenant/instance/member selection. The latest snapshot is compared against freshly derived canonical source and payload; mismatch or ineligible current membership is marked stale. Explicit output projections include only revision, timestamps, freshness, normalized job status and bounded attempt summaries. They exclude provider identifiers, raw receipts, source policy vectors, leases and execution credentials. Organization-default views do not expose member delivery. Historical readback is never a grant.

## Background capability preparation

company_human_capability_preparer is a separate NOLOGIN role with tenant/product-scoped policy and mapping reads, minimal identity reads, snapshot INSERT, enqueue-only job insertion and constrained capability-preparer audit. It cannot change preferences, private user fields, delivery outcomes or access. Web-service, owner, superuser and bypass-RLS credentials fail runtime worker validation. Snapshot actor constraints preserve human/service separation; service preparation does not impersonate the original administrator.

Each scan page is limited to 50 bound suspended mappings. Every member is revalidated inside its own serialized transaction; snapshot, job enqueue and audit commit together. Prior committed members survive a later member failure, and restarting the page deduplicates unchanged sources. Suspended administrators do not block refresh for other active members. Current organization/user/member/instance eligibility still gates preparation. Active-member policy changes and provider activation are not handled by this preparer.

## Health collector boundary

company_human_health_worker is a separate NOLOGIN role with tenant/product RLS, observation insert and scoped service audit only. Collection rejects owner/superuser/bypass/general-service connections. The collector accepts registered adapters rather than caller-provided URLs, bounds getHealth to ten seconds and strips free-form provider output. Observation and audit are atomic. No health result grants access. Hosted worker credentials/scheduling remain unconfigured.

## Local Convex state isolation

Local Convex development state may contain deployment credentials and database contents. `.convex/` is excluded from Git and both root/nested `.convex` directories are explicitly excluded from Vercel CLI uploads. Local OAuth signing keys remain separate from production. Never upload local state as a deployment artifact.

## Contributor apps — 2026-09-22

Migration 0043 grants the application read role only public assignment-state columns and restricts rows to the current user's active membership. The Apps page uses this read role, not administrative service credentials. Provider IDs and mutation authority remain unavailable.

### Email request limits

Convex reserves email-send capacity transactionally in the authentication mutation before creating a token or calling Resend. Initial limits are five requests per normalized email per hour and 1,000 per deployment per hour. They apply to direct API requests as well as the form. Verification itself does not consume send capacity. Failed delivery still consumes a reservation; a rejected reservation rolls back and cannot invalidate the current valid link. These are initial abuse ceilings, not tenant commercial entitlements. A distributed attack can exhaust the global ceiling; adaptive abuse protection and operational alerting remain launch work.

Pending invitation tokens are retained in same-origin local storage for cross-tab email sign-in, with a 30-minute application expiry. They are cleared on successful acceptance or sign-out and never included in the OAuth redirect. Browser storage is not an authorization boundary: invitation acceptance still validates the authenticated recipient and tenant on the server. Expired entries are removed on the next invitation visit; expiry does not imply physical browser deletion while the app is closed.

Usage ingestion requires a nonowner, non-BYPASSRLS role granted `company_human_usage_ingest`. A server-resolved signing authority binds key ID to organization, product, instance, environment and source system; request fields cannot choose this authority. Signatures and scope are checked before persistence, RLS restricts instance/environment/tenant access, and immutable tables are not exposed to ordinary workspace roles. Public credential resolution and key rotation are not yet implemented; the internal library is not exposed as an unauthenticated API.

The usage HTTP endpoint now resolves expiring/revocable signing scopes from server configuration and rejects tampering, cross-tenant/instance/product/source/environment requests before database access. It accepts no browser session as service authority, caps actual body bytes, and returns generic database errors. The ingestion connection has a five-second connect timeout and ten-second statement timeout. Public key administration, per-key request throttling and operational key rotation remain outstanding before broad third-party exposure.

Usage reporting uses verified canonical user identity, a restricted reader connection and database RLS. GET /api/organizations/[organizationId]/usage rejects unknown or duplicate query keys and invalid scopes/windows, returns no-store on every response and hides database errors. Read permission does not expose source envelopes or internal provider cost.

Human usage provenance is enforced in both the event parser and database. Signed events cannot attribute a nonexistent or different user to a membership, use a foreign tenant membership/team, or bypass this check with direct SQL under the ingestion role. Historical suspended memberships remain valid attribution references.

Quarantine release requires budgets.manage in the event organization. The service role cannot insert release receipts directly; a narrowly owned SECURITY DEFINER function with fixed search_path performs validation and append. Customer readers receive event/organization references only, subject to their usage scope. POST release also requires same-origin and verified canonical actor identity.

Member denial journaling uses a non-login restricted trigger owner; runtime workers cannot directly mutate access_revision. Completion revalidates organization/member/provider target and revision against immutable intent. Higher-revision denial can proceed while older work is outstanding. Stale receipts cannot satisfy current delivery. Real providers must enforce the same revision ordering at execution time.

Identity-offboarding SQL is owned by a dedicated NOLOGIN/NOBYPASSRLS role and cannot be invoked directly by application/service/identity logins. Service commands identify identity-offboarding plus canonical source user/provider timestamp; no human actor is fabricated. Product creation locks and checks the canonical user before existing membership locks, preventing a new enabled mapping from racing past deletion. Audit failure rolls back the entire tombstone. Future re-enable paths must preserve user-before-mapping lock order.

## Policy changes and current provider access

Entitlement/limit edits atomically enqueue fenced denial for bound desired assignments. Failed audit insertion rolls back policy invalidation and commands. Service callers cannot forge policy-origin commands. Remote suspension remains unconfirmed until matching binding, access revision, lease, attempt and complete provider readback pass the restricted projection. Unavailable product states take precedence over pending access changes in the contributor view. Capability preparation and in-flight receipt acceptance recheck the target member's current product.use grant. Role/team/organization/catalog changes still need comprehensive remote invalidation; activation remains disabled until all prerequisites are satisfied.

## Role permission revocation

Removing product.use or another registered catalog-required permission, or assigning a denying role, invalidates affected bound assignments in the same transaction with authorization provenance. Malformed or unknown requirements fail closed. Runtime credentials cannot manufacture that provenance. Restoring permissions leaves policy_blocked in place and does not resume remote access. Application writers acquire a shared authorization lock before row locks; grant moves across organizations lock both tenants in order. Direct concurrent SQL can encounter a deadlock and must retry the entire transaction; an aborted transaction cannot commit partial denial state. The upgrade reconciler is available only to its private owner, not application/worker roles. A pending suspended binding also checks current requirements under the authorization lock. Full provider receipt requirements apply to these denials. Team/commercial policy and real provider execution remain unfinished.

## Catalog permission checks in capability preparation

Restricted capability readers now require each catalog-required permission, plus product.use, on the target member's current tenant role. Unknown catalog permission keys fail closed. The normalized requirement set enters the snapshot source, so changed catalog requirements cannot reuse an older capability snapshot. Positive member-limit delivery checks the same requirements, and migration0062 creates denial intent on their revocation. These are local policy boundaries; no product activation is authorized by a prepared snapshot.

## Positive member limit delivery

The restricted usage-limit worker checks the target member's product.use and all registered catalog-required permissions before applying a positive member limit and again before accepting readback. Each member attempt records the access revision at claim; revocation and restoration leave an older attempt stale. A zero limit remains deliverable as a hard stop after revocation, and organization aggregate limits do not acquire a fictitious member permission requirement. This controls worker delivery only. Atomic provider enforcement against a concurrent access revision, safe product activation and budget enforcement are still pending.

## Organization status boundary

Status changes to suspended or closed atomically block bound desired member access and append immutable service provenance and audit. The general service role cannot forge the source field or call the recovery helper. A failed audit rolls back the organization status change and all denial side effects. The current application still lacks an authorized organization suspension API; local tests use a migration-owner fixture while retaining the rest of the guard. Remote denial is pending until worker delivery and fenced readback succeed.

## Catalog change boundary

The catalog denial trigger is owned by a non-login, non-BYPASSRLS role. Application and worker roles cannot call its recovery helper or forge source_catalog provenance. Access-relevant catalog changes block bound desired members in the same transaction, and an audit insertion failure rolls the catalog edit back. The service command constraint rejects incomplete catalog provenance. Full fenced provider readback is required to mark a denial delivered. Pending suspended binding is serialized with catalog edits by a shared advisory lock and checked against a database-stamped contract revision. A stale binding queues a one-mapping denial; failed audit persistence rolls it back. The same binding now checks required role permissions under the tenant authorization lock. Product activation remains closed.

The bootstrap worker has column-limited role_id read and can call only a wrapper that rejects a product-permission lookup outside its active tenant context. The underlying SECURITY DEFINER permission predicate is not executable by that worker, web or service role. Claim and receipt checks reject blocked members, missing required grants and non-ready products. A late remote suspended identity is retained only as an attempt reference when the request becomes ineligible; it is not treated as local access or provider cleanup.
