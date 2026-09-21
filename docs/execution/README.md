# Company Human execution route

This is the executable index for the existing Notion specification, not a replacement PRD. The full product goal remains active.

- `specification-sources.json`: hub plus all 17 documents, source revision timestamps and content hashes; read in full on 2026-09-21. Raw snapshots are ignored under `.refs/notion`.
- `notion-tasks.json`: all 92 canonical tracker tasks, including acceptance, priority, dependencies and effort. Tracker Done is a reported source status, not automatic acceptance by this route.
- `goal-route.json`: 116 content-addressed goal contracts: root, six program groupings, 17 ordered phase goals, and 92 task leaves. Parent digests, authority inheritance, coverage and estimated effort allocations validate with the installed goal-route-system.
- `mission-control.json`: single mission execution controller, bound to the route and root digests. The controller's default 24-hour lease is a checkpoint window, not a deadline for this product. The active Codex thread goal supplies continuation; this file does not create a background automation.
- `next-admission.json`: CH-6 integration work admitted through the controller. Re-evaluate the current controller at subsequent dispatch boundaries; this receipt is not permanent authorization.

## Ordering and acceptance

The compiler requires six route segments. They group phases 00–03, 04–06, 07–08, 09–11, 12–13 and 14–16, preserving the exact phase order and all tasks. This grouping does not collapse phase gates or allow concurrent implementation. Only one bounded task is executed at a time. A documented external blocker permits independent work without declaring a dependent phase accepted.

The compiler's generic software blueprint was replaced by the canonical task tree. Its built-in budget numbers are not product-owner authority: this route uses Notion effort estimates and leaves token/cost allocations unallocated. No paid service upgrade or money transfer is authorized by a goal contract.

First connected proof: real OAuth workspace creation and invite, real sponsored Scalar access, measured usage visible to the administrator, and enforced suspension/budget stop. This is an intermediate journey. The root still requires all Notion/user outcomes, real Chippi attribution and payouts with merchant billing independence, and all three external beta configurations. Phase 16 expansion and SSO/SCIM remain demand-gated as the specification requires.

## Preserved baseline

Foundation acceptance remains recorded in `../implementation-status.md`: CI at 3fbc494 proved its shared service scenario. Current product commit 4b9d614 passed GitHub run 35627020436. Identity has source, local/CI tests and a deployed Convex backend; real OAuth and the complete identity browser journey remain unverified. The route deliberately does not infer independent phase acceptance from tracker status or compiler validation.

## Current blockers and next work

1. CH-6: configure OAuth provider applications and SITE_URL, then prove consent, canonical synchronization, revocation, invite return and organization isolation. Keep development/production identities separate; no existing product credentials may be reused.
2. Separate Convex cloud development deployment still exceeds the team's quota; dedicated production `sensible-dinosaur-165` is already deployed.
3. Symbolic connection doctor observed HTTP 401 without OAuth discovery (`oauth_challenge_missing`). There is no verified authenticated Context Compiler or Flow read. The Symbolic connection skill identifies this as an integration repair requirement, not a user sign-in failure. Do not substitute an internal credential or claim Symbolic execution.
4. Callix source inspection is complete in `../callix-tracking-assessment.md`. Consume it during Phase 07; no premature attribution implementation is implied.

## Validation and maintenance

Run `python3 scripts/compile-goal-route.py` only when intentionally compiling the canonical snapshot. It depends on the installed goal-route-system skill and must not overwrite a later evidence-bearing route during routine dispatch. Preserve the root digest across reroutes. The initial source manifest binds pre-correction Notion content; its notes identify the two subsequently fixed Clerk references.

Controller checks validate seals and admission, not actual product completion. At acceptance, use falsifiability and necessity/sufficiency: record what failed before, the observed result, exact revision/environment, negative cases and remaining external gates. Require independent runtime evidence before advancing connected capabilities to verified.
