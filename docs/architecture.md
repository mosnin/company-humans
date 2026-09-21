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
