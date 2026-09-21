# Billing

No billing or metering is active. Company Human must become the commercial authority for organization sponsored ecosystem usage, with measured variable cost and budget controls. Source Company OS Stripe plans were intentionally excluded. Merchant customer billing remains in the merchant product.

## Entitlement configuration status

Desired allow/deny/inherit settings are now versioned per product instance and optional member. They neither establish a commercial plan nor authorize spend. Hierarchical budgets, effective entitlement resolution and product-side metering/enforcement remain unimplemented.

## Finite limit intent

Product-instance and member meter limits now have exact decimal, versioned configuration with explicit UTC calendar windows. Zero is a stop; unlimited values are rejected. This does not yet implement the budget engine, usage accumulation, parent/child evaluation, concurrency reservations, warnings, soft stops, billing or actual provider hard stops. The [limit semantics and adapter gap](usage-limit-semantics.md) must be resolved with verified meter/unit/window mappings before enabling spend.

The authenticated usage-limit mutation endpoint now persists this desired configuration. Its response explicitly reports providerEnforcementConfirmed=false. Saving does not evaluate usage or enforce a provider hard stop.
