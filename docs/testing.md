# Testing

The scaffold passed `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and local HTTP checks for `/` and `/api/health` on 2026-09-20 using Node 24. `npm ci` uses the committed `.npmrc` to reproduce the source compatible peer dependency tree. Later phase gates add contract, RLS, adapter, financial, outage, security, and load tests according to the canonical Notion test plan. No end to end product acceptance is claimed by a scaffold build.

The monorepo structure passes local package typecheck, lint, tests, and build. Hosted GitHub CI was triggered on draft PR 1, but run `35494535295` never started a runner. GitHub reported failed account payments or a spending limit. No hosted test result exists.

A fresh local Postgres 18 database accepted migration `0001_product_catalog.sql` and seven reference products. Repeating migration and seed made no additional migration or product rows. CI now has a Postgres service and runs this database contract test, but hosted execution is not yet observed.

Five contract tests now cover typed IDs, schema version rejection, event/audit signing, tamper detection, wrong key rejection, and tenant ID type rejection. These validate contracts only; they do not prove ingestion authorization or durable audit storage.

Local Postgres tests prove duplicate Clerk events preserve one canonical user ID, newer updates apply, deletion hides the user, and an older update cannot revive the tombstone. Webhook route tests cover missing configuration and failed signature verification. A live Clerk callback is still required for task 6 acceptance.

The production build also served `/` and `/api/health` successfully with Clerk unconfigured. `/api/me` and the webhook returned 503, as intended, rather than creating unauthenticated identity state. This is a configuration boundary, not a successful Clerk integration test.

A local Postgres integration test creates two organizations for one user and a third for another user. Owner memberships are created transactionally. Migration `0004_tenant_rls.sql` was applied to the test database. Another test connects as an ephemeral non-owner runtime login: active users see only their own organizations, cross tenant organization and membership reads return no rows, cross tenant updates return no rows, unauthorized inserts fail, and transaction local identity clears on rollback. The web route uses the restricted connection but live Clerk and production runtime credentials remain unverified.

Migration `0005_teams_roles.sql` and six role policy tests pass locally. The integration test resolves all six roles through the restricted runtime connection, verifies separate finance and developer permissions, resolves an assigned team, denies cross tenant team creation and assignment, and denies a manager from changing a team outside their scope or promoting another manager.

Migration `0006_member_lifecycle.sql` passes a local test covering recipient email binding, token hash storage, one use acceptance, active role resolution, suspension denial, reactivation, removal denial, Owner protection, and removal of prior team access after reinvitation. The Clerk authenticated API routes compile in the production build. Delivery of an invitation and revocation of provider sessions have not been tested or implemented.

The organization switch test resolves two organizations for one canonical user under the restricted role and returns no context for the other user's organization. The production build includes `/workspace/select`, `/workspace`, `/api/organizations/switch`, and `/api/context`. A local production server served the pages with HTTP 200; context and switch returned HTTP 503 with Clerk unconfigured, the expected fail closed behavior. Live browser switching remains unverified.

Migration `0007_identity_audit.sql` was applied locally. Tests find transactional audit entries for organization creation and rename, six default role creations, membership creation and role change, invitation creation and acceptance, suspension, reactivation, and removal. A restricted runtime role can read identity audit rows as Owner but Finance sees zero rows. Runtime organization UPDATE now fails even for its owner; the server rename path writes an audit record atomically.

Migration `0008_app_catalog_instances.sql` and product metadata contract pass local tests. An organization Owner can record Scalar enable intent once; the record remains pending, and another organization's user sees no instance under RLS and cannot enable it. No Scalar organization or member has been provisioned.

The version 1 product adapter contract has a compile-checked operation surface and local tests that reject incompatible versions and missing methods. No remote product behavior, idempotency, audit delivery, or usage reporting is verified by this interface test.

Migration `0009_permissions.sql` passed locally. The role integration test now checks that all six memberships carry their canonical primary role ID, persisted grants resolve into request context, a removed grant disappears on the next context read, and a restricted role cannot see another organization's grants. Live authorization is still pending Clerk and production credentials.

The organization creation API has route tests for unauthenticated requests, invalid URL names, and binding the new owner to the authenticated canonical user rather than a body-supplied user ID. The selector now offers a creation form. A local production server returned HTTP 200 for `/` and `/workspace/select`; unauthenticated creation returned HTTP 503 while Clerk was unconfigured, as intended. Browser completion remains unverified without Clerk and a production tenant runtime role.

The sign-in route follows Clerk's optional catch-all App Router pattern and directs successful authentication to organization selection. With no Clerk keys configured, a local production server returned HTTP 200 and rendered a clear unavailable state. Real sign-in and redirect behavior remain unverified.

The invitation acceptance route test denies an unauthenticated caller before the token reaches the database service. The contributor page reads a token from a URL fragment or a pasted code and presents sign-in, unavailable, and invalid states. The route uses a no-referrer, no-store header; live browser acceptance remains pending Clerk configuration.
