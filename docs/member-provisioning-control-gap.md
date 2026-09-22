# Member provisioning: access must remain closed until policy is applied

Reviewed 2026-09-21 against canonical Notion document 05, its provisioning steps 10–13, the owner requirement to prohibit unlimited expensive usage, and the current adapter interface.

## Observed implementation gap

`ProductAdapterV1.provisionMember` accepts canonical organization, instance and membership IDs plus an idempotency key. Its successful result may report `active`. It cannot express or attest that newly created remote membership is initially unable to spend. Entitlements and limits are separate mutations. Merely hiding a Company Human launcher does not prevent a member from visiting the product directly.

The current code stores provisionMember commands but executes only suspend/remove commands. No real Scalar provisioning transport or allow worker is installed. This gap therefore has not been used to grant real access.

## Required next implementation

1. Verify Scalar's actual control API and supported access model. A CRM API key or MCP session is not evidence of member provisioning authority.
2. Require remote member creation to be suspended or otherwise deny product operations by default. An adapter that cannot establish this must not be enabled for automatic provisioning until its product adds a supported control boundary.
3. Apply the current entitlement revision and finite limits while access remains denied; persist each provider receipt under its stable operation key.
4. Read back provider member and policy state. A success response for identity creation alone cannot satisfy this gate.
5. Recheck organization, membership, product enablement and the policy revision before activation. If any changed, keep or restore denial and reconcile outstanding side effects.
6. Resume only after those checks and receipts. Handle ambiguous timeouts with provider reconciliation; timeout is not cancellation.
7. Prove direct product access cannot spend before activation, and duplicate, reordered or stale commands cannot revive removed access.

## Contract compatibility

No existing V1 interface or applied migration is changed by this assessment. If expressing initial denial requires a breaking adapter change, canonical document 05 requires a new version, compatibility window, migration plan, contract tests and incompatible-adapter health reporting. Do not add an optional flag that an old adapter can silently ignore and then claim the safety requirement is satisfied.

## Acceptance still required

Real Scalar create/connect, member provision/suspend/resume/remove, applied entitlements, finite limits, measured usage and policy hard stops. Fixture adapters can verify orchestration invariants but cannot prove any of these provider guarantees. Phase 01 real OAuth and Phase 02 provider acceptance remain open.

## Version 2 contract introduced — 2026-09-21

The additive ProductAdapterV2 contract now requires initialAccess=suspended for provisionMember and accepts only a suspended successful membership result. Its runtime validator rejects a complete V1 adapter before a call, using the normalized adapter_contract_incompatible code. The other lifecycle method signatures are retained. This is a contract boundary, not proof that a remote product honors it.

Compatibility window: existing V1 organization and suspension/removal registrations remain supported until their replacements have passed provider acceptance. No V1 worker is switched to V2 by casting a registration or ignoring its version. V1 is never a fallback for new member creation. Because no live member-provision worker was deployed, no accepted live grants or queued command identities need rewriting for this additive contract.

Migration sequence: implement a V2 registration for Scalar; prove direct access and spend are denied on creation; build restricted, durable orchestration using the V2 request/result schemas; record incompatible registrations as an admin-visible health failure; apply and read back entitlement/limit revisions; revalidate tenant and member state; then resume. Deploy each registration only after its common and live-provider tests pass. Runtime health reporting and the worker remain unimplemented. V1 support may be retired only after all registered consumers migrate and compatibility tests pass.

## Bootstrap execution prerequisite implemented — 2026-09-21

The restricted V2 worker and migration 0030 now journal suspended identity creation with stable retries, validated receipts, target revalidation and atomic audit. It cannot change canonical mappings or activate access. Current successful receipts and superseded late results are retained separately from usable access. Remaining steps are real Scalar control verification, entitlement/finite-limit application, provider state readback, reconciliation and an independently authorized activation boundary. No hosted worker is scheduled.

## Suspended mapping boundary implemented — 2026-09-21

Migration 0031 adds audited, lease- and receipt-bound projection of the remote member identity in suspended state. General workers have no direct mapping update authority. The boundary refuses identity replacement and current-scope mismatches. This provides a canonical reference for subsequent policy/readback stages while leaving access suspended. It does not fulfill steps 3–7 above or validate Scalar's actual remote enforcement.

## Fenced activation contract — 2026-09-22

`ProductMemberAccessAdapterV1` is an additive extension of V2 plus the existing capability and usage-limit extensions. It supplies one monotonic `accessRevision` boundary for activation, suspension and removal, exact canonical/provider identity binding, activation policy preconditions, durable operation reconciliation, and actual access readback. Delayed activation must recheck the fence at execution; a historical successful receipt must never replay a grant after newer denial. Equal revision/content conflicts and reused idempotency keys with changed contents are rejected. Removal is terminal for its external binding; restoring a removed person requires independently authorized reprovisioning.

The extension requires atomic comparison against the provider's complete staged capability and applicable finite limit set when enabling access. Input validation checks binding and rejects missing/duplicate limits; the future orchestrator must still establish coverage for every enabled expensive meter. It must also revalidate canonical membership, organization, product and policy state. A schema-valid request is not an authorization decision.

`verifyMemberAccessConformance` is a reusable adapter test harness for a dedicated disposable member with staged policy. It checks newer denial versus delayed activation, equal-revision conflict, stale capability/limit policy, provider identity substitution, lost-response reconciliation, conflicting idempotency reuse and terminal removal. The fixture must supply controls that hold admitted provider work before execution and release it only after a newer denial commits; ordinary asynchronous operations supply a bounded settlement observer. The suite requires at least two applicable limits and checks unchanged-revision capability/quantity tampering and omission of a required limit. Reference-model tests prove that the harness detects deliberately broken replay, execution-time fencing, capability-content, limit-quantity, and limit-completeness implementations; they do not prove Scalar enforcement.

Compatibility: existing V1 denial registrations remain usable only for their prior denial-only scope. A product adopting fenced activation must route all later lifecycle mutations, including denials and direct product administrative access changes, through its equivalent fence; mixing a fenced grant worker with the old unfenced denial dispatcher is unsafe. No existing registration or live dispatch is upgraded by this contract. Migration order remains provider implementation and conformance, restricted durable activation/reconciliation worker, live provider tests, then registration enablement. No activation worker, Scalar control transport, or live grant is implemented by this change.

#### Dispatcher compatibility update (0048)

The current denial dispatcher now requires the fenced extension and fails closed for legacy registrations. Existing job/attempt history is retained; no known live registrations were upgraded or disrupted. Null or changed bindings explicitly require reconciliation. Grant preparation and automatic late-bootstrap recovery are still absent.
