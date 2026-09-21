# Convex OAuth authentication

The product owner replaced Clerk with Convex Auth on 2026-09-20. The Clerk package, middleware, sign-in component and webhook endpoint have been removed. Applied historical SQL migrations remain immutable; migration 0018 preserves existing canonical IDs and introduces issuer/subject identity keys.

## Configuration

1. The dedicated free-plan `company-humans` project was created through Vercel on 2026-09-21. Production is `sensible-dinosaur-165` in US East (N. Virginia), project ID `3043505`. Creating an additional cloud development deployment still fails with the team's 40-deployment quota. No other product deployment was reused or deleted.
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

The checked-in `_generated` files were regenerated during the real production push on 2026-09-21. Convex schema validation and function deployment succeeded. The CLI does not find the workspace-hoisted TypeScript binary, so `../../node_modules/.bin/tsc -p convex/tsconfig.json --noEmit` was run successfully before `CONVEX_DEPLOYMENT=prod:sensible-dinosaur-165 npx convex deploy --typecheck disable`.

Deployment signing keys (`JWT_PRIVATE_KEY`, `JWKS`) were generated in memory and set directly without printing or committing private values. Live checks verified that anonymous `identity:current` returns null, OIDC discovery uses the dedicated issuer, and JWKS contains one RSA public key without private material. `SITE_URL` is now `https://company-humans.vercel.app`. OAuth provider credentials remain unconfigured: real sign-in is not accepted yet. The ignored `.env.convex-production` records this explicit deployment target; it does not make ordinary local development point at production.

Dashboard: https://dashboard.convex.dev/t/mosnin-s-projects/company-humans/sensible-dinosaur-165

Dependencies use patched `@auth/core` 0.41.3 or later. The older version shown in the setup guide had published vulnerabilities and was not retained.

References: [Convex Auth setup](https://labs.convex.dev/auth/setup), [Next.js integration](https://labs.convex.dev/auth/authz/nextjs), [OAuth configuration](https://labs.convex.dev/auth/config/oauth).

## Local identity configuration check — 2026-09-21

The local `.env.local` contains the three database variable names but no NEXT_PUBLIC_CONVEX_URL; `readProviderIdentity` therefore correctly returns unavailable before querying a session. The separate ignored production Convex environment file is not automatically loaded by Next. Do not solve this by silently connecting ordinary local development to production. Complete an isolated development deployment/local backend configuration and its provider callback setup. The GitHub browser tab still showed sign-in during this check; the owner has a pending sign-in request. No browser OAuth flow or credential configuration completed.
