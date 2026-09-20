# Implementation status

## Review correction — 2026-09-20

The review found an invitation regression and incomplete mutation authorization. The subsequent repair passes 27 local tests, typecheck, lint, and production build. A fresh database accepted all 14 migrations and the seven-product seed. Restricted service credentials now enforce capability checks and contributor privilege denial; production credentials and the live Clerk/browser journey remain unverified. CH-8 and CH-9 remain In progress until their full acceptance scope is demonstrated. See [implementation review](implementation-review.md) for the original findings.

Source specification: [Company Human Notion hub](https://app.notion.com/p/3e1a0db630cf8143bc2bd77af98bc7c8) and [build tracker](https://app.notion.com/p/c1495ea132d6423989674f763497bae7), read on 2026-09-20. A task is verified only when its tracker acceptance is demonstrated.

| Phase | Status | Evidence and remaining gate |
| --- | --- | --- |
| Scaffold migration | Verified locally | Source audit, npm clean install, typecheck, lint, unit health test, production build, and local HTTP smoke test passed; hosted CI is blocked by the GitHub account billing limit; deployment remains pending. |
| 00 Foundation | In progress | Repository and package boundaries build locally. Canonical ID schemas are locally verified. The first migration and deterministic product seed passed twice in a fresh local Postgres database. A version 1 adapter operation interface and completeness check compile and pass local tests. Version 1 signed event/audit envelopes pass local contract tests. Hosted CI acceptance is blocked by the GitHub account billing limit; the roadmap adapter-interface requirement is now implemented as a shared contract, while its real adapter remains in Phase 02. |
| 01 Identity kernel | In progress | Canonical Clerk user mapping, webhook boundary, and a sign-in route are implemented and locally tested where configuration is absent. Organization/membership tables and restricted role RLS pass local multi-tenant reads and cross tenant denial tests. Six default role policies, persisted tenant scoped grants, team scoping, and cross tenant assignment denial pass local tests. A removed grant disappears on the next context read. Audited customization of grants remains. Invite acceptance, suspension, reactivation, and removal pass local database tests. A contributor invitation page now submits the one-use code and shows sign-in, failure, and unavailable states; invitation delivery remains manual. Organization creation API and form, selection UI, and authenticated switch/context routes build; local test proves two organizations resolve to one user without cross tenant access. Identity audit records are transaction bound and tested for creation, rename, role and lifecycle changes. Live Clerk browser sign-in/webhook, invite delivery, production runtime and service role configuration, session revocation, audited permission customization, and browser acceptance remain. |
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

The user confirmed `mosnin/company-humans` as the destination. Local work is on `codex/company-human-foundation`; the draft PR is open at https://github.com/mosnin/company-humans/pull/1. Its Quality job did not start because GitHub reported failed account payments or a spending limit.

## Current external configuration gates

- GitHub Actions run `35494535295` never acquired a runner. GitHub annotated the check: “The job was not started because recent account payments have failed or your spending limit needs to be increased.” Local checks pass, but hosted CI cannot be called verified until account billing is restored and the PR check runs.

- A Company Human Clerk application must provide a publishable key, secret key, and webhook signing secret. Configure `user.created`, `user.updated`, and `user.deleted` delivery to `/api/webhooks/clerk`. No live Clerk authentication or delivery has been demonstrated.
- A separate non-owner `DATABASE_RUNTIME_URL` login must be granted the `company_human_app` role. The local test creates an ephemeral runtime login; production credentials are not configured.

## Authorization repair evidence

Server mutations consult stored capability grants. Separate identity and service logins replace migration-owner credentials in web routes. Database restrictions deny contributor organization edits, self-promotion, team-manager escalation, grant insertion, and product activation. Restricted-role tests cover invitation acceptance, suspension, reactivation, removal, reinvitation without restoring ended team access, and immutable ownership. Read policies deny deleted users. The environment example documents all four database connections. These local checks do not establish live Clerk or deployed acceptance.

## Audited permission editing

Migration 0015 and the role permission API allow an authorized owner or administrator to change another permitted role using stored roles.manage capability. Owner policy and the acting role are protected; an administrator cannot grant a capability they do not hold or edit the Admin policy. Changes require the previously observed permission set, reject stale edits, and append before/after audit state atomically. Restricted-role tests cover change, revocation, stale edits, contributor denial, cross-tenant denial, and audit provenance. Live browser acceptance remains pending.

## Identity administration screens

People now supports paginated search, invitation links, role changes, suspension, resumption, and confirmed removal. Teams supports creation, roster display, and team responsibility assignment. Permissions supports protected owner/acting policies, capability edits, and conflict errors. All pages authorize on the server and use restricted database services. The source shell is generalized for these identity pages, with loading, error, empty, and permission states. Ten browser component tests pass at desktop and mobile sizes; real Clerk authentication and the full live Phase 01 scenario remain unverified. These screens do not imply completion of the later human-workspace modules.

## Verified invitation onboarding

Invitation acceptance now fetches the current Clerk profile and requires its verified primary email, even when a canonical user is already cached. Database redemption checks that verified email against the invitation and canonical user. Webhook normalization does not treat unverified email as invitation identity. The invite token survives sign-in only in tab-scoped storage for 30 minutes; it is removed from the URL and cleared after successful acceptance. The sign-in return target is fixed to `/invite`, not a caller-supplied URL. Thirty-three unit/database/route tests and twelve desktop/mobile component tests pass, along with typecheck, lint, and production build. Real Clerk sign-in is still unverified.

## Identity audit reader

Migration 0017 permits scoped audit reads through the service role only with audit.read.all. The `/workspace/audit` page shows paginated identity events, actor names, timestamps, targets, and before/after state. It cannot modify history. Restricted-role tests cover allowed owner reads, contributor denial, cross-tenant denial, and continued denial of audit updates.
