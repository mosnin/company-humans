# Security

The scaffold has no authenticated or tenant scoped product routes. The health endpoint returns only service status and revision. Clerk authentication, server authorization, database RLS, service credentials, and tenant isolation tests are Phase 01 work. The source Convex Auth proxy was intentionally excluded.
