# Company OS Web scaffold assessment

Source: `mosnin/company-os-web` `main` at `94827a320e06958995263b32a44d6fc8c227d7a1`. Destination started from a README-only repository. The source checkout was cloned separately and left unchanged.

## Architecture observed

- Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind 4, Vitest, Playwright, Node 24, npm lockfile.
- Convex data and functions, Convex Auth, and Convex HTTP routes. Convex `companies` and `members` are canonical to Company OS, with owner/admin/member roles. They do not implement Company Human's global identity, team, sponsorship, or Postgres RLS contract.
- Stripe billing is for Company OS plans and app purchases. Copying it would conflate merchant, product, and Company Human commercial authority.
- Next.js `proxy.ts` gates Company OS routes using Convex Auth; business authorization is rechecked in Convex functions. It cannot be carried over to a Clerk and Company Human tenant model.
- The source UI uses a semantic monochrome token system, Geist typography, reusable button/card/page header/loading primitives, responsive layouts, and separate marketing and authenticated shells.
- Vercel build scripts deploy Convex before building production. That deployment coupling is Company OS specific. The source quality workflow runs lint, typecheck, unit tests, build, Playwright, and Builder checks.
- Source environment examples include Convex, auth email, AI, and private registry variables. No such secrets or deployment IDs were copied.

## Copied code audit

| Source | Classification | Company Human treatment |
| --- | --- | --- |
| `app/globals.css` semantic tokens and type scale, lines 1–900 | Reuse after generalization | Copied the shared token and type foundation; omitted Company OS workspace/marketing selectors and brand asset references. |
| `components/ui/button.tsx`, `card.tsx`, `page-header.tsx`, `skeleton.tsx` | Reuse unchanged | Kept mature interaction, empty/loading geometry, and responsive header behavior. Product specific comments are historical source provenance. |
| `lib/utils.ts` | Reuse unchanged | Shared class merging and formatting helpers. |
| `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `vitest.config.ts` | Reuse after generalization | Kept compatible build configuration. Removed the Builder typecheck and Company OS scripts from the package contract. |
| `docs/DESIGN_LANGUAGE.md`, `anti-slop.md` | Needs investigation | Retained as source reference and quality constraints. Company Human needs a product specific visual contract before feature UI expands. |
| `app/layout.tsx`, `app/page.tsx`, `app/icon.svg`, metadata | Replace | New Company Human metadata and restrained landing scaffold; no Company OS brand assets. |
| `convex/**`, `proxy.ts`, auth pages, invite routes | Replace | Source authentication and tenant model conflict with Clerk plus canonical Company Human identity and RLS. Phase 01 owns replacement. |
| `app/(app)/**`, source product modules, Builder, CLI, skills | Remove | Company OS domain behavior and navigation do not belong in Company Human. |
| `lib/billing/**`, `convex/billing.ts` | Replace | Company Human's billing authority, usage, and sponsorship are different. Phase 03 owns replacement. |
| Marketplace, OAuth, MCP, Cadre, Operate integrations | Needs investigation | Reuse patterns only after independent contract and authority review in the relevant phase. |
| Source health route and Vercel/CI configuration | Reuse after generalization | Independent web health route; future dependency checks and CI will be specific to Company Human. |

## Architecture issue recorded before implementation

The source uses Convex Auth and Convex as its database. The Company Human specification locks Clerk for authentication and requires database level tenant isolation, with Postgres RLS or an equivalent. Copying source auth or schema would contradict that contract. The destination therefore retains only the web and design foundation; Phase 01 must establish its own identity and database boundary. This is an explicit migration decision, not an unreviewed architecture substitution.
