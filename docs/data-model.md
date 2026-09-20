# Data model

The Company Human Postgres schema has global users, organizations, memberships, teams, roles, invitations, identity audit records, a draft product catalog, and pending product instances. Tenant rows carry organization identity. Permission and role-permission tables, entitlements, usage, and financial objects remain unimplemented. Company OS Convex IDs are never Company Human canonical IDs.

## Phase 00 identifier contract

`@company-human/contracts` defines version 1 canonical IDs for users, organizations, memberships, teams, roles, products, product instances, events, and audits. IDs use `ch_<kind>_<32 lowercase UUID hex>`; provider identifiers stay in separate mapping fields. Serialized ID references carry `schemaVersion: 1` and validate kind against prefix. Tables and RLS are being added in roadmap order.

The first Postgres migration creates a global product catalog and a checksum checked migration history. The seed adds Company OS, Scalar, Operate, Cadre, Marketer, Tell Me, and Stored using deterministic canonical IDs. It does not create organizations, memberships, entitlements, or billing state.

Phase 01 migration `0002_global_users.sql` adds global users keyed by canonical Company Human ID with a separate unique Clerk user mapping. Provider event time and a deleted tombstone prevent stale webhook delivery from reviving a deleted user. Organization and membership tables were added in migration `0003`.

Migration `0003_organizations_memberships.sql` creates organization tenants and membership relations. One canonical user can own or join multiple organizations; every membership has an organization ID, role key, status, and sponsorship type. The current service creates owner membership in the same transaction.

Migration `0004_tenant_rls.sql` adds RLS for organizations and memberships. The restricted application role can read active organizations for its transaction local canonical user, read that user's active memberships, and cannot update organization fields directly after migration `0007`. Integration tests prove distinct tenant visibility, denied cross tenant update, denied insert, and cleared identity context after transaction end. Later migrations add invitations and additional tenant policies; authorization coverage remains incomplete.

Migration `0005_teams_roles.sql` creates six canonical organization role records per organization, team records, and scoped team memberships. An organization and role composite key prevents a membership from referencing another tenant's role. Composite foreign keys prevent team membership from crossing organization boundaries. Restricted role and team reads are covered by RLS. The initial role to capability policy is versioned in `@company-human/contracts`; organization role customization and per member overrides remain future work.

Migration `0006_member_lifecycle.sql` adds invitation records with a hashed one use token, recipient email, role, expiry, and acceptance state. A prior removed membership may be reactivated by a fresh matching invitation while retaining its canonical ID. Removing a member ends team membership records without deleting them. Per member permission overrides and Clerk session revocation remain pending.

Migration `0007_identity_audit.sql` creates identity audit records with the versioned audit envelope and before/after state. The runtime role can read audit records only as an active Owner or Admin. Direct runtime updates to organizations are revoked so names change through an audited server transaction. A migration owner can still change tables directly; production must isolate that credential and add stronger immutability controls before security acceptance.

Migration `0008_app_catalog_instances.sql` extends reference products with draft/ready/retired catalog status and versioned metadata storage. It creates tenant scoped product instances with an instance key, provisioning mode, desired enable state, and actual provisioning state. An enable request records pending intent only. No external organization ID or active entitlement is invented before an adapter confirms it.
