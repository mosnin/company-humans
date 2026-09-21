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
