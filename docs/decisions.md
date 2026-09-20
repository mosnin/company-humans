# Decisions

## 2026-09-20: Copy the visual foundation, isolate Company OS behavior

Company OS Web uses Convex Auth and a Convex company data model. Company Human's canonical specification requires Clerk authentication and database tenant policy. Reusing the source auth, billing, or product routes would create conflicting sources of truth. The scaffold copies the Next.js stack and audited UI primitives, then implements Company Human's domain contracts independently in roadmap order. See [migration assessment](migration-assessment.md).

## Open repository identity

The user named `mosnin/company-human`, but GitHub returned 404 for that repository. `mosnin/company-humans` was created on 2026-09-20 and contains a README. Local work is prepared in a clone of that repository; the intended remote must be established before pushing.
