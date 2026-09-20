# Data model

No Company Human database schema exists yet. Phase 00 will define canonical versioned IDs and migration/seed workflows. Phase 01 will implement global users, organizations, memberships, teams, roles, permissions, and tenant isolation. Do not use Company OS Convex IDs as Company Human canonical IDs.

## Phase 00 identifier contract

`@company-human/contracts` now defines version 1 canonical IDs for users, organizations, memberships, teams, roles, products, product instances, events, and audits. IDs use `ch_<kind>_<32 lowercase UUID hex>`; provider identifiers stay in separate mapping fields. Serialized ID references carry `schemaVersion: 1` and validate kind against prefix. Database tables and RLS are still pending.

The first Postgres migration creates a global product catalog and a checksum checked migration history. The seed adds Company OS, Scalar, Operate, Cadre, Marketer, Tell Me, and Stored using deterministic canonical IDs. It does not create organizations, memberships, entitlements, or billing state.

Phase 01 migration `0002_global_users.sql` adds global users keyed by canonical Company Human ID with a separate unique Clerk user mapping. Provider event time and a deleted tombstone prevent stale webhook delivery from reviving a deleted user. Organization and membership tables remain pending.

Migration `0003_organizations_memberships.sql` creates organization tenants and membership relations. One canonical user can own or join multiple organizations; every membership has an organization ID, role key, status, and sponsorship type. The current service creates owner membership in the same transaction and lists only active organizations for the requested canonical user. Database RLS, invite lifecycle, and role permission tables remain pending.
