# Billing

No billing or metering is active. Company Human must become the commercial authority for organization sponsored ecosystem usage, with measured variable cost and budget controls. Source Company OS Stripe plans were intentionally excluded. Merchant customer billing remains in the merchant product.

## Entitlement configuration status

Desired allow/deny/inherit settings are now versioned per product instance and optional member. They neither establish a commercial plan nor authorize spend. Hierarchical budgets, effective entitlement resolution and product-side metering/enforcement remain unimplemented.

## Finite limit intent

Product-instance and member meter limits now have exact decimal, versioned configuration with explicit UTC calendar windows. Zero is a stop; unlimited values are rejected. This does not yet implement the budget engine, usage accumulation, parent/child evaluation, concurrency reservations, warnings, soft stops, billing or actual provider hard stops. The [limit semantics and adapter gap](usage-limit-semantics.md) must be resolved with verified meter/unit/window mappings before enabling spend.

The authenticated usage-limit mutation endpoint now persists this desired configuration. Its response explicitly reports providerEnforcementConfirmed=false. Saving does not evaluate usage or enforce a provider hard stop.

Organization and member usage-limit administration now exposes this configuration with exact quantities, UTC windows, immutable units and revision conflict handling. It displays parent organization caps separately and explicitly states enforcement is unconfirmed. It does not calculate remaining capacity or authorize unlimited usage when unconfigured.

### Usage ingestion storage (CH-20 preparation)

The signed usage contract and restricted transactional ingestion library now exist. Valid canonical meter/version/unit events are accepted; unknown or mismatched meters are retained in quarantine. Identical retries return the existing event; changed retries fail with an idempotency conflict. Original signed JSON is preserved even when numeric storage normalizes decimal formatting. The signed HTTP endpoint now uses an operator-configured credential registry (see integrations.md). No valuation, invoice or charge is produced. Source cost and customer-rate version remain explicit nullable provenance until real providers/pricing supply them.

### Scoped usage windows (CH-21 preparation)

Exact decimal usage aggregates now support half-open occurrence windows and organization, product, instance, team and member breakdowns. Product, meter version and unit remain separate. Sum, maximum and deterministic last-value meters are supported; late reports appear on the next read. Only accepted events count. This is a live read projection, not a durable billing snapshot or budget reservation. The authenticated usage API labels results permitted-usage: contributors see their authorized subset, managers their managed teams and finance/admin their authorized organization totals. No invoice, charge or live provider enforcement is claimed.

Quarantined events can now be released after an exact product/meter/version/unit is registered. A budgets.manage-authorized action appends a release receipt; it never changes the source event. Aggregation includes the released event once. Historical valuation and billing snapshots remain unimplemented.

The CH-22 shared contract now describes separate organization, product, product-instance, operation-team, member, capability and meter policy scopes for a single exact product meter/version/unit and UTC day/week/month window. A pure resolver retains every applicable threshold and its own action, returns the earliest configured threshold without treating it as a spend decision, and rejects missing or mismatched team attribution. Migration 0069 validates a named human usage team against assignment time; a null team and non-human attribution remain insufficient for team limits. No budget policy storage, actual consumption evaluation, reservation, priced cross-product budget, or provider stop is implemented.

The dedicated Usage page reports the authenticated reader's permitted consumption by product/meter, with explicit production/test and inclusive UTC dates. It preserves exact numeric strings and labels total, peak and latest-value aggregation. It does not show a bill estimate or claim provider enforcement.
