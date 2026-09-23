# Company OS Web scaffold assessment

Source: `mosnin/company-os-web` `main` at `94827a320e06958995263b32a44d6fc8c227d7a1`. Destination started from a README-only repository. The source checkout was cloned separately and left unchanged.

## Architecture observed

- Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind 4, Vitest, Playwright, Node 24, npm lockfile.
- Convex data and functions, Convex Auth, and Convex HTTP routes. Convex `companies` and `members` are canonical to Company OS, with owner/admin/member roles. They do not implement Company Human's global identity, team, sponsorship, or Postgres RLS contract.
- Stripe billing is for Company OS plans and app purchases. Copying it would conflate merchant, product, and Company Human commercial authority.
- Next.js `proxy.ts` gates Company OS routes using Convex Auth; business authorization is rechecked in Convex functions. Those Company OS sessions and tenant rules cannot be reused for Company Human's independent identity and PostgreSQL RLS boundary.
- The source UI uses a semantic monochrome token system, Geist typography, reusable button/card/page header/loading primitives, responsive layouts, and separate marketing and authenticated shells.
- Vercel build scripts deploy Convex before building production. That deployment coupling is Company OS specific. The source quality workflow runs lint, typecheck, unit tests, build, Playwright, and Builder checks.
- Source environment examples include Convex, auth email, AI, and private registry variables. No such secrets or deployment IDs were copied.

## Copied code audit

| Source | Classification | Company Human treatment |
| --- | --- | --- |
| `app/globals.css` semantic tokens and type scale | Reuse after generalization | Kept shared surface, typography, spacing, and interaction tokens; removed source-specific commentary and unused animation behavior. |
| `components/ui/button.tsx`, `card.tsx`, `page-header.tsx`, `skeleton.tsx` | Reuse after generalization | Kept mature interaction, empty/loading geometry, and responsive header behavior; removed Company OS-specific commentary. |
| `lib/utils.ts` | Reuse after generalization | Kept class merging; removed unused source formatting helpers. |
| `tw-animate-css` dependency and global import | Remove | No Company Human component uses its animation utilities; Tailwind's built-in `animate-spin` supplies the one loading animation. |
| `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `vitest.config.ts` | Reuse after generalization | Kept compatible build configuration and removed the source Playwright cache hook and Company OS scripts. |
| `docs/DESIGN_LANGUAGE.md`, `anti-slop.md` | Remove | Removed the source product screen manual and generic rulebook; retained relevant design foundations in `docs/design.md`. |
| `app/layout.tsx`, `app/page.tsx`, metadata | Replace | New Company Human metadata and restrained landing scaffold; no Company OS brand asset or tracked `app/icon.svg` was copied. |
| `convex/**`, `proxy.ts`, auth pages, invite routes | Replace | Company Human uses a dedicated Convex Auth project for Google and email sessions, with a separate canonical PostgreSQL identity and RLS model. Source sessions, credentials, functions and tenant rules were not copied. |
| `app/(app)/**`, source product modules, Builder, CLI, skills | Remove | Company OS domain behavior and navigation do not belong in Company Human. |
| `lib/billing/**`, `convex/billing.ts` | Replace | Company Human's billing authority, usage, and sponsorship are different. Phase 03 owns replacement. |
| Marketplace, OAuth, MCP, Cadre, Operate integrations | Needs investigation | Reuse patterns only after independent contract and authority review in the relevant phase. |
| Source health route and Vercel/CI configuration | Reuse after generalization | Independent web health route and Company Human CI. Removed the redundant standalone API app. |

## Architecture issue recorded before implementation

The source uses Convex Auth and Convex as its database. The original Company Human specification named Clerk and required database level tenant isolation. The owner subsequently chose Convex Auth with Google and email magic link for Company Human. That decision is recorded in [decisions](decisions.md) and leaves the PostgreSQL canonical tenant model and RLS boundary in place. Copying Company OS sessions, functions or schema would still cross a product boundary, so Company Human uses an independent Convex project and its own identity synchronization. Live provider sign-in remains unverified.

## Source shell restoration

The identity administration UI now generalizes the source `components/shell/app-shell.tsx` geometry into `WorkspaceShell`: full-width 56px header, 240px desktop rail, rounded body sheet, independent scrolling canvas, keyboard skip link, and mobile menu. Source table scroll/border geometry and native input control states are generalized into administration controls. Company OS route parsing, Convex hooks, product navigation, search, and company cookies are excluded. Only implemented identity pages appear. Desktop and 390px mobile browser component tests render these components and verify interactions; their API/authentication is explicitly mocked, so they do not establish live identity acceptance.

## 2026-09-20 owner override

The owner chose Convex Auth over Clerk. Company Human has Google and email magic-link code but provider setup and authenticated production acceptance remain open. Company OS source remains untouched. No Company OS deployment or OAuth credential has been reused.
