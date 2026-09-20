# Convex OAuth authentication

The product owner replaced Clerk with Convex Auth on 2026-09-20. The Clerk package, middleware, sign-in component and webhook endpoint have been removed. Applied historical SQL migrations remain immutable; migration 0018 preserves existing canonical IDs and introduces issuer/subject identity keys.

## Configuration

1. Create a dedicated Company Human Convex project on the free plan. The connected Vercel-managed Convex team currently refuses creation because its 40-deployment quota is reached. Do not reuse another product's deployment or delete one without selecting it with the owner.
2. From `apps/web`, run `npx convex dev --configure existing` and select the Company Human project. This generates normal deployment types and pushes the functions. Set `NEXT_PUBLIC_CONVEX_URL` to that deployment's cloud URL in the web environment.
3. Generate separate RS256 signing keys for each deployment using `jose` (`generateKeyPair`, `exportPKCS8`, `exportJWK`). Configure `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` on Convex. Never commit keys. `SITE_URL` is the exact web origin, such as `http://localhost:3000` during local development.
4. Configure the chosen OAuth applications. GitHub uses `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`; Google uses `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, stored on Convex. Callback URLs are `https://<deployment>.convex.site/api/auth/callback/github` and `/api/auth/callback/google`. Only list configured providers in the web's `AUTH_ENABLED_PROVIDERS` (`github`, `google`, or both).
5. Run the database migration with a migration-owner credential. The web uses the three separate restricted database connections described in `.env.example`.
6. Verify real OAuth login, canonical sync, workspace creation, invitation return, switching, removal and sign-out before accepting Phase 01.

OAuth apps still require their own provider configuration. Convex is the authentication/session backend; it does not remove Google/GitHub's OAuth application requirements.

## Request flow

The sign-in button calls Convex Auth. The Next proxy manages the callback and HttpOnly session cookies. `/auth/complete` sends a same-origin POST to synchronize only the profile returned by the authenticated Convex query, then opens `/workspace/select` or `/invite`. The query verifies the live session record, its owner and expiration. The server resolves canonical identity using the configured deployment origin plus Convex user ID. Roles, memberships and product grants are resolved from Company Human PostgreSQL records, never OAuth profile fields.

Google's verified-email claim and GitHub's verified primary-email endpoint are required. Accounts with matching email are not automatically linked. Canonical deleted-user tombstones cannot be reactivated by sign-in. Missing provider configuration fails closed.

## Verification boundary

Convex backend tests exercise session existence, expiration, owner mismatch, revocation, and account linking denial using `convex-test`. Route tests exercise same-origin synchronization and server-derived identity. Browser component tests mock OAuth actions; they are not real provider consent or token exchange.

The checked-in `_generated` files were generated offline using the installed Convex CLI (`npx convex codegen --system-udfs --init --typecheck disable`) because no deployment slot was available. They are typechecked against the real schema. Normal `npx convex dev --once` deployment and codegen remain required; no remote Convex deployment is claimed.

Dependencies use patched `@auth/core` 0.41.3 or later. The older version shown in the setup guide had published vulnerabilities and was not retained.

References: [Convex Auth setup](https://labs.convex.dev/auth/setup), [Next.js integration](https://labs.convex.dev/auth/authz/nextjs), [OAuth configuration](https://labs.convex.dev/auth/config/oauth).
