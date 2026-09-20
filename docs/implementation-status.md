# Implementation status

Source specification: [Company Human Notion hub](https://app.notion.com/p/3e1a0db630cf8143bc2bd77af98bc7c8) and [build tracker](https://app.notion.com/p/c1495ea132d6423989674f763497bae7), read on 2026-09-20. A task is verified only when its tracker acceptance is demonstrated.

| Phase | Status | Evidence and remaining gate |
| --- | --- | --- |
| Scaffold migration | Verified locally | Source audit, npm clean install, typecheck, lint, unit health test, production build, and local HTTP smoke test passed. Remote commit and deployment pending repository identity. |
| 00 Foundation | In progress | Repository and package boundaries build locally. Canonical ID schemas are locally verified. The first migration and deterministic product seed passed twice in a fresh local Postgres database. Version 1 signed event/audit envelopes pass local contract tests. Hosted CI acceptance remains. |
| 01 Identity kernel | In progress | Canonical Clerk user mapping and webhook boundary are implemented and locally tested. Organization/membership tables and restricted role RLS pass local multi-tenant reads and cross tenant denial tests. Six role policies, team scoping, and cross tenant assignment denial pass local tests. Invite acceptance, suspension, reactivation, and removal pass local database tests. Organization selection UI and authenticated switch/context routes build; local test proves two organizations resolve to one user without cross tenant access. Identity audit records are transaction bound and tested for creation, rename, role and lifecycle changes. Live Clerk browser sign-in/webhook, invite delivery, production runtime and service role configuration, session revocation, and broader authorization remain. |
| 02 Application provisioning | In progress | Catalog metadata contract, tenant scoped product instance model, admin enable intent, and cross tenant tests exist locally. Scalar adapter, actual activation, member provisioning, entitlements, health, and UI remain. |
| 03 Metering and billing | Not started | Real usage and policy stop remain. |
| 04 Human workspace | Not started | Role aware workspace remains. |
| 05 CRM and human work | Not started | Tenant isolated CRM and assignments remain. |
| 06 Company OS context | Not started | Scoped context and denial tests remain. |
| 07 Attribution | Not started | Real Chippi referral path remains. |
| 08 Commission and payout | Not started | Real reconciled payout remains. |
| 09 Ecosystem adapters | Not started | Contract proven first party adapters remain. |
| 10 Creator and UGC | Not started | CRM free configuration remains. |
| 11 White label and enterprise | Not started | Configuration and exports remain. |
| 12 Reliability and scale | Not started | Outage, recovery, security, and 3,000 member proof remain. |
| 13 Chippi dogfood | Not started | Real contributors and commercial loop remain. |
| 14 Pricing calibration | Not started | Production telemetry remains. |
| 15 External beta | Not started | Three organization archetypes remain. |
| 16 Platform expansion | Not started | Deferred until first party contracts stabilize. |

The named GitHub destination `mosnin/company-human` was not visible on 2026-09-20. `mosnin/company-humans` exists and was cloned for local preparation. Remote selection needs confirmation before a push.

## Current external configuration gates

- The intended GitHub destination must be resolved before pushing or observing hosted CI.
- A Company Human Clerk application must provide a publishable key, secret key, and webhook signing secret. Configure `user.created`, `user.updated`, and `user.deleted` delivery to `/api/webhooks/clerk`. No live Clerk authentication or delivery has been demonstrated.
- A separate non-owner `DATABASE_RUNTIME_URL` login must be granted the `company_human_app` role. The local test creates an ephemeral runtime login; production credentials are not configured.
