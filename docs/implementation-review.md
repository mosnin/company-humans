# Implementation review — 2026-09-20

Reviewed destination `mosnin/company-humans`, branch `codex/company-human-foundation`, committed baseline `06046c1508750f36cbcf6e7490f1b46135f88a65` plus unfinished working changes. Implementation paused at the user's request to investigate specification drift. No source repository changes were made during this review.

## Findings

1. **Authorization completion was overstated.** Notion 04 requires every API and database mutation to validate organization and capability scope. `organization-authority.ts` and `membership-lifecycle.ts` authorize administrative mutations using hardcoded owner/admin role names. `rls.ts` reads persisted permission grants, but those mutation guards do not consult them. Removing a grant from the resolved context therefore does not remove the corresponding mutation authority. CH-8 and CH-9 have been returned from Done to In progress.
2. **Uncommitted service policies are incomplete.** Migration 0010 grants the service role writes on membership, organization, team, invitation, and product-instance tables. Its policies check organization membership/invitation scope, without operation-specific capabilities. This establishes tenant scope but does not independently enforce contributor versus administrator write authority at the database boundary. This is a static code finding, not a demonstrated public API exploit. Do not treat this migration as production-ready. Preserve the unfinished changes for repair.
3. **Current verification is failing.** The current typecheck passes. Running `DATABASE_URL=<local verification database> npm test` passes 9 contract tests and 8 database tests, but fails the membership lifecycle test: recipient mismatch now raises a null-ID Zod validation error instead of the expected domain error. The root command stops before web tests. Earlier green results do not describe the current working tree. Lint and production build were not rerun in this investigation.
4. **Scaffold migration preserved too little of the application shell to establish design fidelity.** The destination has four UI primitives and shared tokens. Source shell components such as `app-shell`, `nav-sidebar`, `page-layout`, `topbar`, and `phone-dock` have no equivalent reuse demonstrated in the destination. The workspace page shows only an organization-selected card. A build/HTTP smoke check cannot establish preservation of mature layout and responsive interaction quality.
5. **No completed identity user journey has been demonstrated.** The roadmap's Phase 01 scenario requires organization creation, contributor invite, team/role assignment, organization switching, and cross-tenant denial. Local database and route tests cover parts; live Clerk/browser acceptance and administrative interaction remain absent. Later workspace modules are explicitly not started; their absence is unfinished scope, not by itself an architectural contradiction.
6. **Configuration documentation trails the code.** Working changes require `DATABASE_IDENTITY_URL` and `DATABASE_SERVICE_URL`, while `.env.example` documents neither. Following the supplied environment example cannot configure the current authentication/mutation paths.
7. **Phase sequencing lost its acceptance gates.** Phase 02 pending product-instance work started while Foundation and Identity remained in progress. External configuration blockers can justify independent contract work, but they do not establish that dependent product behavior has a verified identity foundation.

## Diagnosis and recovery order

The repository contains useful foundation work: shared contracts, migrations, canonical identity, tenant isolation tests, audit records, and invitation logic. The execution problem is treating small implementation artifacts and narrow checks as sufficient evidence for broader task completion. This produced optimistic tracker entries while the usable product and authorization boundary remained incomplete.

Repair the current authorization and invitation regressions first, synchronize environment documentation, and demonstrate capability revocation plus contributor privilege denial using the actual restricted database roles. Then prove the complete Phase 01 user journey through Clerk and the browser. Revisit source shell generalization with rendered desktop/mobile comparison before accepting scaffold design fidelity. Proceed to real Scalar provisioning only after the required identity gates pass. Keep the existing Notion architecture and phase order; no replacement PRD or platform rewrite is needed.

## Authority reviewed

- [04 Identity Roles Permissions and Organization Sponsorship](https://app.notion.com/p/3e1a0db630cf819ca7c7fb059f952031)
- [07 Human Workspace Information Architecture and UX](https://app.notion.com/p/3e1a0db630cf8123a301c46baec2756e)
- [15 Phased Build Roadmap](https://app.notion.com/p/3e1a0db630cf819585ccd74a6968af50)
- Build tracker CH-8 and CH-9, fetched with their Done status before correction.

This is a focused investigation of the current divergence, not a claim that every requirement across all 17 specification documents has passed a new exhaustive review.
