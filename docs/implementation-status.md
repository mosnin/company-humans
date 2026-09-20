# Implementation status

Updated 2026-09-20. Destination: `mosnin/company-humans`, branch `codex/company-human-foundation`, [draft PR 1](https://github.com/mosnin/company-humans/pull/1). Company OS remains unchanged.

## Verified locally

- Shared canonical IDs, signed event/audit contracts, migration checksums, deterministic product seeds, and versioned adapter interface.
- A restricted test service creates real canonical users, organization and membership, then signs a shared event; changing its tenant invalidates the signature.
- Identity synchronization, tenant isolation, stored capabilities, audited permission changes, invitation lifecycle, team scope, and append-only runtime audit permissions.
- Direct contributor SQL cannot promote itself, change the organization, become a team manager, grant permissions, or activate a product.
- People, Teams, Permissions, and Audit pages use scoped services. The shell generalizes Company OS's header, rail, canvas, form, and table design.
- Invitation acceptance requires a fresh verified Clerk email. The token survives sign-in in tab storage for 30 minutes and clears on acceptance.
- 33 contract/database/route tests pass. Twelve desktop/mobile browser component tests pass with explicitly mocked authentication/API responses. Typecheck includes test sources; lint and production build pass.
- A fresh local development database accepts all 17 migrations and seven reference-product seeds. Restricted connection credentials are stored only in ignored `apps/web/.env.local`; no Clerk keys or tenant demo records were created.

## Phase gates

| Phase | Status | Remaining acceptance |
| --- | --- | --- |
| Source scaffold | Implemented; local checks pass | Live authenticated layout and deployment verification. |
| 00 Foundation | In progress | Hosted CI must run. Local foundation exit scenario passes. |
| 01 Identity kernel | In progress | Real Clerk sign-in/webhook, browser create/invite/accept/assign/switch/suspend scenario, deployed database-role verification. |
| 02 Provisioning | In progress; groundwork only | Real Scalar adapter, product membership, entitlements, state machine, health, and full lifecycle proof. Catalog/pending intent grants no access. |
| 03 Metering and billing | Not started | Measured Scalar usage, budgets, hard stops, cost and billing projections. |
| 04 Human workspace | Not started | Contributor Work, Apps, Context, Earnings, Leaderboard, Team, manager workflows. Identity administration is not this phase's completed shell. |
| 05 CRM and human work | Not started | Native records, assignments, visibility, actor attribution, Scalar sync. |
| 06 Company OS context | Not started | Real connection, approved scopes, freshness, revocation, denial. |
| 07 Attribution | Not started | Merchant links, SDKs, verified Chippi events and recoverable attribution. |
| 08 Commission and payout | Not started | Provider-neutral ledger, real provider execution and reconciliation. |
| 09 Ecosystem adapters | Not started | Real adapters and shared contract tests. |
| 10 Creator and UGC | Not started | Creator workflows with CRM/Scalar disabled. |
| 11 White label and enterprise | Not started | Branding, domains, bulk operations, templates and exports. |
| 12 Reliability and scale | Not started | Outbox, replay, recovery, security, privacy and load acceptance. |
| 13 Chippi dogfood | Not started | Real contributors and commercial loop. |
| 14 Pricing calibration | Not started | Production telemetry. |
| 15 External beta | Not started | Sales, referral and UGC organizations without forks. |
| 16 Platform expansion | Not started | Deferred until first-party contracts stabilize. |

## External gates

1. **Clerk configuration:** the checkout has no Company Human Clerk keys, and the connected browser reaches Clerk's sign-in page. The application name/configuration has been requested. Configure the publishable key, secret key and webhook signing secret, then verify actual sessions and delivery. Do not substitute mock authentication for this gate.
2. **GitHub Actions:** run `35520300589` at `0b8ab73` completed with no runner steps. Its annotation says account payments failed or the spending limit must be increased. Local green checks are not hosted CI success.
3. **Production:** no Company Human deployment or production database-role acceptance has been demonstrated. The Vercel project listing inspected did not include a matching project; that listing is not proof that no project exists elsewhere.

CH-8, CH-9, CH-10 and CH-12 have progress evidence in Notion and remain In progress. The original findings remain in [implementation review](implementation-review.md); the authorization and invitation defects described there have subsequent repair commits. No later phase has been marked verified.
