# Security

The scaffold has no authenticated or tenant scoped product routes. The health endpoint returns only service status and revision. Clerk authentication, server authorization, database RLS, service credentials, and tenant isolation tests are Phase 01 work. The source Convex Auth proxy was intentionally excluded.

The Phase 00 envelope library validates versioned event and audit fields and can sign and verify them with a caller supplied 32 byte or longer key. No production signing key exists in this repository. API authentication, key storage, rotation, replay/idempotency enforcement, and audit persistence remain unimplemented.
