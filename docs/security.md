# Security

The scaffold has no authenticated or tenant scoped product routes. The health endpoint returns only service status and revision. Clerk authentication, server authorization, database RLS, service credentials, and tenant isolation tests are Phase 01 work. The source Convex Auth proxy was intentionally excluded.

The Phase 00 envelope library validates versioned event and audit fields and can sign and verify them with a caller supplied 32 byte or longer key. No production signing key exists in this repository. API authentication, key storage, rotation, replay/idempotency enforcement, and audit persistence remain unimplemented.

Phase 01 has begun with a Clerk webhook and canonical user table. The webhook refuses requests when its signing secret or database URL is absent and rejects failed signature verification before database mutation. The on-request resolver checks Clerk session identity and then loads or creates a canonical active user. Live Clerk delivery and sign-in remain unverified because no Clerk application keys or webhook configuration are available in this workspace.
