# Data model

The Company Human Postgres schema currently has the product catalog, global users, organizations, memberships, and tenant RLS. Teams, role permissions, invitations, and the remaining tenant objects are Phase 01 work. Company OS Convex IDs are never Company Human canonical IDs.

## Phase 00 identifier contract

`@company-human/contracts` defines version 1 canonical IDs for users, organizations, memberships, teams, roles, products, product instances, events, and audits. IDs use `ch_<kind>_<32 lowercase UUID hex>`; provider identifiers stay in separate mapping fields. Serialized ID references carry `schemaVersion: 1` and validate kind against prefix. Tables and RLS are being added in roadmap order.

The first Postgres migration creates a global product catalog and a checksum checked migration history. The seed adds Company OS, Scalar, Operate, Cadre, Marketer, Tell Me, and Stored using deterministic canonical IDs. It does not create organizations, memberships, entitlements, or billing state.

Phase 01 migration `0002_global_users.sql` adds global users keyed by canonical Company Human ID with a separate unique Clerk user mapping. Provider event time and a deleted tombstone prevent stale webhook delivery from reviving a deleted user. Organization and membership tables remain pending.

Migration `0003_organizations_memberships.sql` creates organization tenants and membership relations. One canonical user can own or join multiple organizations; every membership has an organization ID, role key, status, and sponsorship type. The current service creates owner membership in the same transaction.

Migration `0004_tenant_rls.sql` adds RLS for organizations and memberships. The restricted application role can read active organizations for its transaction local canonical user, read that user's active memberships, and update limited organization fields when that user is its owner. Integration tests prove distinct tenant visibility, denied cross tenant update, denied insert, and cleared identity context after transaction end. Invite lifecycle and wider tenant policies remain pending.

Migration `0005_teams_roles.sql` creates six canonical organization role records per organization, team records, and scoped team memberships. An organization and role composite key prevents a membership from referencing another tenant's role. Composite foreign keys prevent team membership from crossing organization boundaries. Restricted role and team reads are covered by RLS. The initial role to capability policy is versioned in `@company-human/contracts`; organization role customization, invitations, and per member overrides remain future work.
