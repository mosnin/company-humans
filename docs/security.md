# Security

## Identity and tenant boundary

Convex Auth handles OAuth sessions. Company Human owns canonical users, memberships, tenant policy and authorization. Google must report a verified email; GitHub must return a verified primary email from its authenticated email API. Accounts are never merged automatically by matching email. Canonical identities are keyed by issuer and subject, retaining provider event ordering and deleted-user tombstones.

Each request queries Convex with its session token and checks the current session record, ownership and expiration. A revoked session or deleted authentication user is denied even if the JWT has not expired. The canonical sync endpoint accepts only same-origin POST and ignores client identity fields. Invitation redemption uses the authenticated provider's verified email and checks it again against canonical user and invitation in PostgreSQL. Provider verification reflects the latest successful OAuth sign-in; it does not poll Google/GitHub on every request.

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
