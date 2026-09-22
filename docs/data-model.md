# Data model

The Company Human Postgres schema has global users, organizations, memberships, teams, roles, invitations, identity audit records, a draft product catalog, product instances, and pending product-member mappings. Tenant rows carry organization identity. Permissions and role-permission mappings now exist. Entitlements, usage, and financial objects remain unimplemented. Company OS Convex IDs are never Company Human canonical IDs.

## Phase 00 identifier contract

`@company-human/contracts` defines version 1 canonical IDs for users, organizations, memberships, teams, roles, products, product instances, events, and audits. IDs use `ch_<kind>_<32 lowercase UUID hex>`; provider identifiers stay in separate mapping fields. Serialized ID references carry `schemaVersion: 1` and validate kind against prefix. Tables and RLS are being added in roadmap order.

The first Postgres migration creates a global product catalog and a checksum checked migration history. The seed adds Company OS, Scalar, Operate, Cadre, Marketer, Tell Me, and Stored using deterministic canonical IDs. It does not create organizations, memberships, entitlements, or billing state.

Phase 01 migration `0002_global_users.sql` adds global users keyed by canonical Company Human ID with a separate unique Clerk user mapping. Provider event time and a deleted tombstone prevent stale webhook delivery from reviving a deleted user. Organization and membership tables were added in migration `0003`.

Migration `0003_organizations_memberships.sql` creates organization tenants and membership relations. One canonical user can own or join multiple organizations; every membership has an organization ID, role key, status, and sponsorship type. The current service creates owner membership in the same transaction.

Migration `0004_tenant_rls.sql` adds RLS for organizations and memberships. The restricted application role can read active organizations for its transaction local canonical user, read that user's active memberships, and cannot update organization fields directly after migration `0007`. Integration tests prove distinct tenant visibility, denied cross tenant update, denied insert, and cleared identity context after transaction end. Later migrations add invitations and additional tenant policies; authorization coverage remains incomplete.

Migration `0005_teams_roles.sql` creates six canonical organization role records per organization, team records, and scoped team memberships. An organization and role composite key prevents a membership from referencing another tenant's role. Composite foreign keys prevent team membership from crossing organization boundaries. Restricted role and team reads are covered by RLS. The initial role to capability policy is versioned in `@company-human/contracts`; migration `0009_permissions.sql` persists it per organization and resolves active capabilities through tenant RLS. Organization role customization is implemented through audited stored grants; per-member overrides remain future work.

Migration `0006_member_lifecycle.sql` adds invitation records with a hashed one use token, recipient email, role, expiry, and acceptance state. A prior removed membership may be reactivated by a fresh matching invitation while retaining its canonical ID. Removing a member ends team membership records without deleting them. Per member permission overrides remain pending. The authentication replacement below supersedes the original Clerk integration.

Migration `0007_identity_audit.sql` creates identity audit records with the versioned audit envelope and before/after state. The runtime role can read audit records only as an active Owner or Admin. Direct runtime updates to organizations are revoked so names change through an audited server transaction. A migration owner can still change tables directly; production must isolate that credential and add stronger immutability controls before security acceptance.

Migration `0008_app_catalog_instances.sql` extends reference products with draft/ready/retired catalog status and versioned metadata storage. It creates tenant scoped product instances with an instance key, provisioning mode, desired enable state, and actual provisioning state. An enable request records pending intent only. No external organization ID or active entitlement is invented before an adapter confirms it.

Migration `0009_permissions.sql` adds the global permission catalog, versioned default grants, and organization scoped role-permission rows. It backfills the primary role ID on memberships and enforces that role ID, role key, and organization identify the same role. New organizations inherit the default grants transactionally. Restricted runtime connections can read role permissions only for an active organization membership; they cannot change grants. The access context now reads persisted grants, so removing a grant removes the capability on the next request. Audited, concurrency-checked grant customization is exposed in the Permissions administration page.

## Identity audit reader

Migration 0017 permits scoped audit reads through the service role only with audit.read.all. The `/workspace/audit` page shows paginated identity events, actor names, timestamps, targets, and before/after state. It cannot modify history. Restricted-role tests cover allowed owner reads, contributor denial, cross-tenant denial, and continued denial of audit updates.

## Provider-neutral identity (0018)

The product owner replaced Clerk with Convex Auth on 2026-09-20. Migration 0018 renames the provider subject field and adds a provider issuer. Existing canonical IDs, audit references and legacy mappings remain intact; legacy issuer `https://clerk.legacy.invalid` deliberately cannot match a new Convex deployment. Unique `(auth_issuer, auth_subject)` prevents collisions across deployments. Email is not a linking key. A deliberate, audited account-linking flow would be needed to transfer a legacy account; none is implemented automatically.

## Provisioning journal (0019)

`provisioning_operations` carries canonical `ch_op_` IDs, organization and instance composite references, a unique stable idempotency key and one initial provisionOrganization operation per instance. Status is pending, running, retry_wait, succeeded or failed. A two-minute lease fences a running attempt; at most five attempts may be claimed. `provisioning_attempts` preserves actor, lease, timestamps, outcome, normalized failure code and provider reference for each attempt. Completed attempts cannot be rewritten and runtime roles cannot delete either table. Ordinary journal receipts cannot activate instances. The restricted dispatcher can activate a confirmed active organization through the atomic function introduced in 0020–0021. Only provisioned mode is queued; existing pending provisioned instances are backfilled by the migration.

The activation function is owned by a separate non-login, non-superuser, non-RLS-bypass role with only the select/column-update grants it requires. The provisioner is not a member of that owner role. A narrow EXECUTE grant is the only runtime activation path; general application service credentials cannot execute it or rewrite external references.

## Product membership mapping (0022)

`product_memberships` maps a canonical organization membership to one product instance using `ch_pmem_` IDs. Composite foreign keys prevent either reference from crossing tenants; the tuple is unique. Desired enablement is separate from provider-confirmed provisioning status. External member ID, receipt reference and provisioned timestamp are required for active state. Runtime service credentials can create pending intent and deny desired access, but cannot populate provider fields, mark active, delete history or re-enable a denied mapping.

`requestProductMembership` requires applications.manage, an active member/user and an enabled active product instance. Concurrent requests produce one record and one audit entry. This is a server-only mapping prerequisite: no member dispatcher, entitlement grant, launcher or real Scalar access is implemented by this record. Entitlements and budget enforcement must precede usable access.

## Product-member lifecycle commands (0023–0024)

`product_membership_commands` records immutable provisionMember, suspendMember and removeMember requests with organization, mapping, desired-state revision, canonical operation ID, actor and stable idempotency key. A new mapping and its initial command commit together. Suspension/removal advances desired_revision, disables the mapping, appends a command and records audit in the membership transaction. Runtime credentials cannot update or delete commands. No command receipt or provider execution is claimed.

Member administrators can deny mappings after changing membership status even without applications.manage; they gain no activation or provider-field privileges. Membership status updates and mapping inserts share a transaction advisory lock. The original row-lock implementation encountered the existing owner UPDATE policy; migration 0024 preserves that policy and applied checksums while replacing the lock mechanism. Resuming a workspace membership or accepting a fresh invite never enables old mappings automatically.

## Product disable boundary (0025–0026)

`disableProductInstance` requires applications.manage and serializes on the instance. It sets desired enablement false, disables enabled member mappings, increments their desired revision, and appends suspendMember commands and audits atomically. Repeated requests do not duplicate commands. Observed provider state is preserved. A mapping INSERT holds a shared parent-instance lock while verifying active/enabled state, so it cannot slip past a concurrent disable sweep. A product-admin command policy permits suspension for disabled products without changing workspace membership. General service updates cannot alter provider status or re-enable disabled instances; reconciliation remains required.

## Member denial execution journal (0027)

`member_denial_jobs` references an immutable, tenant-bound suspendMember/removeMember command. Status is pending/running/retry_wait/succeeded/failed/superseded; leases last two minutes and attempts are capped at five. `member_denial_attempts` preserves the execution credential's role, lease, timestamps, normalized outcome/code and provider reference. The original human actor remains on the command; execution does not impersonate that human. Completed attempts cannot be updated and runtime credentials cannot delete them.

Claims are serialized per organization/product, filter by the registered product, and skip mappings with another unexpired denial lease. New jobs are created only for the current denied mapping revision. Older work is superseded; its receipt cannot satisfy the newer command. The journal does not update product-membership provider projections or confer access.

## Service execution audit (0028)

Audit rows now distinguish human and service actors. Human events retain actor_user_id; service events use actor_service_id and cannot carry a user or membership identity. Database constraints require the actor in the versioned envelope to agree with the row. Existing human events remain unchanged. Member-denial claim/receipt/exhaustion/supersession events are inserted in the job transaction and link to the immutable command containing the initiating human. No lease or provider reference appears in these audit payloads.

## Versioned entitlement intent (0029)

Entitlement policies have canonical ch_ent IDs and tenant-bound instance/member references. A null member identifies an organization default; a member ID identifies an override. Partial unique indexes prevent duplicate policies at either scope. Revisions append allow/deny/inherit with actor and timestamp; the database enforces consecutive revisions. Runtime credentials cannot update or delete policy/history. The server uses optimistic expectedRevision and serializes concurrent changes, recording the revision and human audit in one transaction.

## Suspended member bootstrap journal (0030)

member_bootstrap_jobs and member_bootstrap_attempts reference immutable tenant-bound provisionMember commands. Jobs use pending/running/retry_wait/succeeded/failed/superseded states; attempts retain lease, execution role, outcome, normalized code and provider reference. Completed attempts are immutable. A succeeded bootstrap means only that the V2 adapter reported suspended creation. The canonical product-membership projection remains pending and no access is granted. Later policy/readback/activation orchestration must explicitly consume and revalidate this evidence. Superseded receipts remain available for reconciliation.

## Suspended provider identity binding (0031)

A current successful bootstrap receipt now binds product_memberships.external_member_id and sets provisioning_status to suspended. provider_receipt_reference identifies the immutable command/attempt, and provisioned_at records the receipt time. The suspended mapping remains unusable until later policy, finite-limit, readback and activation gates. A superseded receipt stays in the journal without changing the mapping. A conflicting external identity is rejected with provider_binding_rejected while its receipt remains available for reconciliation.

## Finite product usage limit intent (0032)

product_usage_limits uses canonical ch_lim IDs, tenant-bound instance/member references, a named catalog meter, immutable unit and UTC day/week/month window. Null membership is the organization/product scope; an explicit membership adds a member constraint. Quantities append to product_usage_limit_revisions as exact decimal values, with actor, timestamp and consecutive revision. Runtime roles cannot update/delete policies or history. Unit consistency is enforced across an instance's scopes/windows. No aggregation, reservation or effective allowance is implied.

## Usage-limit execution journal

Migration 0033 adds usage_limit_jobs and usage_limit_attempts. Job identity is (usage_limit_id, revision), with composite organization foreign keys to immutable policy history. New revisions enqueue atomically through an invoker-rights trigger. Backfill selects the latest revision per policy. Jobs reserve bounded lease/retry state; attempts retain immutable provenance and completed apply/readback receipts. The restricted dispatcher is now implemented; production execution remains unconfigured. No job or receipt substitutes for the complete current-policy activation gate.

Migration 0034 enables the restricted usage-limit worker role and scoped journal access. Jobs now execute through leases; attempts preserve validated apply/readback receipts, normalized outcome and worker provenance. Superseded results remain history. No new domain tables or product-access state transitions are introduced.

Migration 0035 adds immutable requested_external_organization_id to provisioning_operations and permits connectOrganization only with a target; provisionOrganization requires no target. Candidate identity is distinct from the confirmed product-instance binding. Only the restricted connection activation function can project a matching active receipt into the instance. Existing create jobs remain unchanged.

Migration 0036 adds tenant-scoped restricted provisioner receipt policies and replaces human-attributed worker audit insertion with constrained service audit. No domain tables or activation privileges are added. An operation can be failed for activation denial while its immutable attempt truthfully records the provider's succeeded outcome; the retained provider reference supports future reconciliation.

Migration 0037 adds no domain tables. Both organization activation functions now validate the immutable initiating actor on the matching unfinished provisioning_attempts row. The limited function owner receives SELECT with capability-scoped RLS on attempts; completed attempt provenance is unchanged.

## Durable requested capability snapshots

Migration 0038 adds member_capability_snapshots keyed by product membership and monotonically increasing policy revision, with a composite tenant reference. Each row retains the complete staged payload, source entitlement revisions, supported catalog capabilities, desired member revision, external target identities, initiating actor and timestamp. Runtime credentials have scoped SELECT/INSERT only; the database checks sequence and canonical target identity. These rows describe requested configuration, not provider receipts or effective grants.

## Capability execution journal

Migration 0039 adds capability_jobs and capability_attempts keyed by product membership and snapshot revision, with composite tenant references. Every new snapshot enqueues atomically; backfill schedules only the latest snapshot. Jobs retain leases, retry times and bounded status; completed attempts retain immutable worker provenance and apply/readback receipts. The capability worker can update journal state but cannot change snapshot configuration or product-member access.

Migration 0040 adds service provenance to member_capability_snapshots. Each row has exactly one human or capability-preparer service actor; existing human history remains unchanged. Source policy revisions still identify original policy records/authors. The restricted preparer can append snapshots and enqueue their jobs but cannot update snapshots, delivery results or product-member access.

## Application health observations

Migrations 0041–0042 add application_health_observations keyed by UUID, with organization/instance composite foreign key, collection start/recording times, sanitized health or normalized failure and checked external organization binding. Runtime workers may append but cannot update/delete history. The current admin read selects the latest-started observation for the current binding; obsolete/null bindings are excluded.

## Contributor apps — 2026-09-22

Migration 0043 adds contributor self-read policy and limited column grants on product_memberships. No new table or external provider state is introduced.

Convex authentication adds `authEmailRequestLimits`, an internal table keyed by normalized email or the deployment-wide bucket. It stores hourly request counts and window start times. Only the authentication mutation accesses it; no public read/write function is exposed. It contains authentication rate-limit state, not canonical organization or commercial data.

Migration 0044 adds immutable `meter_definitions` keyed by product/meter/version and `usage_events`. Every usage row carries organization, product instance, environment, event/source/idempotency IDs, actor envelope, member/team attribution, exact quantity, occurred/reported/received times, signature, source cost and customer-rate version. Composite foreign keys reject cross-tenant instance/member/team references. Two deduplication constraints protect both source-event and idempotency identities within the tenant/instance/environment. Meter and event update/delete triggers prevent rewriting history.

Migration 0045 grants customer readers quantity/provenance columns only, excluding signed envelopes and provider costs. Usage RLS follows own, currently managed team, or organization-wide capabilities; suspended memberships and revoked team management lose access. Aggregation groups preserve meter/version/unit boundaries and exact PostgreSQL numeric strings.

Migration0046 binds human usage to historical canonical membership through a generated actor user ID, an envelope consistency CHECK and composite organization/membership/user foreign key. Explicit matching actor and payload memberships are mandatory for human events. Suspension does not erase attribution or invalidate delayed usage.

Migration0047 adds usage_quarantine_releases: one immutable event-linked receipt with organization, original member/team attribution, actor, reason and database timestamp. Its narrow function owner validates the current actor permission and exact meter. The source event retains its original quarantined disposition and signature. Customer RLS and aggregation resolve effective acceptance through the release receipt.

Migration0048 adds product membership access_revision and immutable member_access_commands. Existing lifecycle denial command insertion atomically allocates the revision, captures provider binding and creates the existing member_denial_jobs record. Historical commands are backfilled without provider success. Jobs/attempts remain the single durable execution history.
