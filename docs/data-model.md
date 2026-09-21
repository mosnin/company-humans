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
