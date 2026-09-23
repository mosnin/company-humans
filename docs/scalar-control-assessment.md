# Scalar sponsored-access control assessment

Reviewed 2026-09-21 against canonical Notion document 05 (Application Platform and Provisioning Contract), especially sections 3, 5–7 and 9. This records a concrete integration gap before changing architecture. It does not replace the canonical contract or certify the deployed provider.

## Evidence boundary

Read-only GitHub inspection of `mosnin/Sicarii`, explicit `main`, resolved to `f773ee94e32406c93b6d51dd408aa40e51938975`. The recursive tree was complete (`truncated=false`). Inspected routes and the source files linked below. No Scalar repository, deployment, user, membership, billing configuration or production data was changed. Local reference copies are ignored under `.refs/scalar-control-review`.

The route inventory has CRM/data actions, account keys, billing, OAuth/MCP and Clerk webhooks. It exposes no identifiable dedicated organization/member provisioning, entitlement or Company Human limit-control route. This is source evidence for this revision, not proof that no separate service or newer deployment supplies those operations. An authenticated provider contract still needs to be established.

## Capability and gap matrix

| Required capability | Observed source | Missing acceptance or implementation |
| --- | --- | --- |
| Organization create/connect | Workspace accounts are `User` rows keyed by a Clerk organization ID; first-session resolution creates the row. | Authenticated external create/connect authority, canonical organization binding, ownership verification and idempotent readback. |
| Global human identity and sponsored launch | Scalar browser sessions use Clerk. Company Human uses Convex Auth. | A verified identity/session bridge and scoped launch path; matching email alone cannot bind accounts. Company Human does not need to return to Clerk. |
| Member create in suspended state | `TeamMember` contains workspace/user IDs, role and optional Clerk membership ID; resolver mirrors session membership. | Persistent deny state enforced by actual requests, suspended creation, versioned updates and readback. Inserting a local mapping cannot establish provider denial. |
| Suspend/resume/remove | Clerk webhook mirrors membership updates/deletion; session resolver can upsert the mirror. | Company Human-authorized lifecycle API plus guards against stale sessions/webhooks recreating revoked access. Scope revocation to the sponsored workspace, not unrelated personal use. |
| Capability policy | Workspace role resolves to admin/member; account API keys resolve to an account. | Revisioned whole-set policy, explicit denial, exact readback and enforcement across browser, API, MCP and background execution. |
| Finite budgets | A pooled account credit balance with preflight reads and conditional debit after a successful lookup. | Member/team/capability limits, canonical policy revisions and atomic reservation before incurring cost; concurrent preflight reads are not reservations. |
| Durable usage | `spendCredits` updates the balance, then attempts a ledger insert separately and swallows ledger failure. | Transactionally durable usage/outbox with unique operation identity, member/actor attribution, replay and reconciliation. Current account ledger alone cannot guarantee every expensive action is reported. |
| Administrator activity | Auth context separates a browser actor from its account; detailed API-key auth returns key identity. | Carry that actor through costly operations and usage events. The inspected enrichment route passes only account ID into the operation, losing the human member at that boundary. |
| Health and recovery | General health route exists in inventory; MCP has request-rate guards. | Contract-version and control-connection health, scoped operation lookup, partial-result reconciliation and provider-state readback. Rate limiting is not budget enforcement. |

## Concrete source observations

- [Workspace resolver](https://github.com/mosnin/Sicarii/blob/f773ee94e32406c93b6d51dd408aa40e51938975/src/lib/workspace.ts): `resolveWorkspace` provisions free/200-credit workspace accounts and upserts the acting user's membership from Clerk session context. Its own comments say the mirror is not an access decision.
- [Auth context](https://github.com/mosnin/Sicarii/blob/f773ee94e32406c93b6d51dd408aa40e51938975/src/lib/auth-utils.ts): `getAuthContext` exposes account, actor and role; `getAuthenticatedUser` returns only the account. Browser membership authority currently comes from Clerk.
- [Account keys](https://github.com/mosnin/Sicarii/blob/f773ee94e32406c93b6d51dd408aa40e51938975/src/lib/api-auth.ts): authentication checks key existence/revocation and returns its account. It does not establish a canonical Company Human membership or control-plane scope.
- [Membership and ledger schema](https://github.com/mosnin/Sicarii/blob/f773ee94e32406c93b6d51dd408aa40e51938975/prisma/schema.prisma): `TeamMember` lacks suspended state/policy revision; `CreditLedger` is account-scoped with optional nonunique `ref`, and is described as best-effort.
- [Credits](https://github.com/mosnin/Sicarii/blob/f773ee94e32406c93b6d51dd408aa40e51938975/src/lib/credits.ts): `ensureCredits` reads available balance; `spendCredits` conditionally decrements later, followed by a separately caught ledger write. `maybeReset` applies plan-based refill. That refill is not a Company Human budget revision and must not reopen exhausted sponsored policy.
- [Enrichment](https://github.com/mosnin/Sicarii/blob/f773ee94e32406c93b6d51dd408aa40e51938975/src/lib/contact-enrich.ts): `enrichContactField` calls `ensureCredits` at line 151 and `spendCredits` at line 268, around provider work. Inference: two overlapping calls can both pass the initial read; one can fail its debit after external cost has already occurred. This is a source-derived concurrency finding, not a reproduced production incident.

## Required provider work before acceptance

1. Establish an authenticated, tenant-bound control transport, operation lookup and credential rotation. Confirm whether a separate existing service satisfies it before adding endpoints.
2. Provide immutable canonical-to-provider organization/member bindings and a verified user session/identity bridge. Keep personal organizations and commercial responsibility independent.
3. Persist access suspension and policy revision separately from Clerk's membership mirror. Apply it at every execution entry and background continuation; reject stale updates and ensure creation cannot spend.
4. Support current Company Human adapter V2 suspended provisioning, capability replacement/readback, finite limits/readback and explicit authorized activation. Mutation idempotency must reject reuse with conflicting payloads.
5. Reserve bounded spend atomically before expensive work; settle or release reservations on completion/failure. Couple durable usage and actor provenance to settlement, handle ambiguous provider outcomes and preserve counters during policy changes.
6. Make sponsorship override the requirement for a member to purchase a separate Scalar plan. Scalar's own subscriptions/refills must not reset externally imposed limits or change Company Human commercial authority.
7. Publish connection health and observable operation results, support replay/reconciliation and prove denial after removal during active work.
8. Run the real acceptance sequence from document 05: organization create/connect, member provision suspended, apply/read back capabilities and finite limits, activate, use without separate purchase, report measured usage, exhaust budget, suspend/resume/remove and reconcile retries.

No guessed HTTP endpoint, shared administrator credential, direct Scalar database write or email-based identity link is an acceptable substitute. Keep the Scalar catalog unactivated until its supported contract and real acceptance environment are established.

## Company Human work that can proceed

Existing contracts and restricted workers remain reusable. The next independent UI task is exposing the implemented connect-existing intent through an authorized Applications flow with honest pending/failed state. It must explicitly state that entering an external organization identifier does not prove ownership or grant access; provider authentication and verification remain required. Complete desired-versus-effective lifecycle orchestration only against confirmed provider semantics. No phase gate is closed by this assessment.
