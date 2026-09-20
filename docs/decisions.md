# Decisions

## 2026-09-20: Copy the visual foundation, isolate Company OS behavior

Company OS Web uses Convex Auth and a Convex company data model. Company Human's canonical specification requires Clerk authentication and database tenant policy. Reusing the source auth, billing, or product routes would create conflicting sources of truth. The scaffold copies the Next.js stack and audited UI primitives, then implements Company Human's domain contracts independently in roadmap order. See [migration assessment](migration-assessment.md).

## Open repository identity

The user named `mosnin/company-human`, but GitHub returned 404 for that repository. `mosnin/company-humans` was created on 2026-09-20 and contains a README. Local work is prepared in a clone of that repository; the intended remote must be established before pushing.

## 2026-09-20: Use a separate runtime role for tenant reads

The migration owner connection can bypass RLS and therefore must not serve tenant read routes. A restricted `company_human_app` role has only SELECT and limited organization UPDATE privileges. A distinct login granted this role is configured through `DATABASE_RUNTIME_URL`; the database helper checks it is neither superuser, BYPASSRLS, nor table owner. The server sets a transaction local canonical user after Clerk authentication. This role remains trusted server infrastructure because a holder of the SQL credential could change its own custom context setting. No database credential may reach clients.

## 2026-09-20: Keep initial roles explicit and scope managers to their teams

The six initial organization roles have canonical IDs and an explicit capability matrix in the shared contracts package. Finance and Developer start with narrow domain permissions. Team managers can assign members to an assigned team, while creating teams and assigning manager status require Owner or Admin. Job labels such as salesperson and creator remain workspace templates, not core roles.

## 2026-09-20: Use one use invitation tokens and preserve removed team history

Invitation tokens are random and stored only as hashes. A logged in Clerk user may accept an invitation only when their canonical active email matches its recipient. A removed membership can be reactivated by a fresh invitation, retaining its canonical identity, while prior team assignments stay ended. Invite delivery currently requires an Admin to share the returned token; no email provider has been selected. Provider session revocation and external product offboarding remain explicit Phase 01 and later integration work.

## 2026-09-20: Treat the active organization cookie as a preference

Organization switching writes an HttpOnly preference cookie only after a restricted RLS membership check. Every context read rechecks the selected organization against the signed in canonical user. A changed or stale cookie cannot grant another tenant's access. The browser UI cannot be accepted until live Clerk and a production runtime database role are configured.

## 2026-09-20: Require transactional audit for identity mutations

The restricted application role no longer updates organization rows directly. Narrow server services append a versioned audit envelope and before/after state in the same database transaction as organization, role, membership, team, and invitation mutations. This provides local evidence of changes, but a production append-only audit guarantee still requires separation of migration and runtime service credentials.
