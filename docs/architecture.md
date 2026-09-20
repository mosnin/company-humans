# Architecture

Company Human is a separate product. The code contains a Next.js web app with API routes and shared contract and database packages. The web visual primitives come from Company OS Web. The implemented identity slice maps Clerk users to canonical users, stores organizations, memberships, roles, teams, invitations, and audit records in Postgres, and resolves tenant access through a restricted RLS login. The control plane now stores catalog entries and organization product enable intent. External product provisioning, usage, billing, human work, CRM, attribution, payout, and the remaining planes are not implemented. Specialized products remain independent sources of truth.

See [migration assessment](migration-assessment.md) for the source audit and recorded auth/database incompatibility.

Phase 00 defines a version 1 product adapter interface plus version 1 event and audit envelopes in `@company-human/contracts`. Both carry canonical organization IDs and actor provenance. The server only signing subpath uses domain separated HMAC SHA-256 with stable JSON ordering and constant time comparison. Identity audit envelopes are persisted transactionally. Event ingestion, replay, key management, and stronger audit immutability remain later work.
