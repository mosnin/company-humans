# Callix tracking reuse assessment

Inspected read-only on 2026-09-21: `mosnin/callix`, `main`, commit `6fb2f7c5b1fcfcd694172a09b5e94b2c190f9169`. No Callix files or deployment were changed. This is source inspection, not live merchant acceptance.

## Reuse decisions

| Source | Decision | Company Human application |
| --- | --- | --- |
| `convex/tracking.ts` request parser and bounded body reader | Generalize | Strict allowlist; 16 KiB cap; validate dates, opaque IDs, text lengths, origin, path without query/fragment. Keep tracking observations separate from verified conversions. |
| Pixel routing and lifecycle | Generalize | Public routing tokens, configured origins, owner-managed rotation and immediate invalidation. Map to canonical organization + integration environment; do not treat Origin or public token as authentication. |
| Browser receipt transaction | Generalize | Tenant/pixel/event identity plus payload hash; same event deduplicates, altered payload conflicts. Preserve these semantics in PostgreSQL with unique constraints and transactions. |
| Quotas and retention | Generalize | Rate-limit before reading the body; cap daily observations; bounded retention deletion. Callix's 120 requests/minute, 10,000 observations/day, 14-day retention and 24-hour event-age cutoff are implementation defaults, not adopted Company Human policy. Merchant recovery requires an independently specified late-event path. |
| `components/dashboard/tracking.tsx` browser helper | Replace SDK packaging; reuse principles | Consent assertion required, `credentials: omit`, no capture of form values or full URL, explicit event schema. New SDK must persist referral token, capture allowed UTM fields, keep stable event IDs across retries, associate signup, and survive outages. |
| Browser ingestion tests | Generalize test cases | Tenant isolation, spoofed origin remains untrusted, schema expansion, oversized bodies, missing consent, quota, dedupe/conflict, token rotation, owner-only control, retention. |
| `tests/attribution-ledger.test.ts` | Reference only | Fixture reconciliation test demonstrates event/value consistency checks; it does not prove production attribution or payouts. |
| Callix dashboard, CRM, AI, ad account overlays and revenue UI | Do not copy | Unrelated product behavior; Company Human retains its own Notion information architecture and source design primitives. |

## Concrete gaps relative to Company Human

The inspected browser helper accepts `utmSource`, `utmMedium`, and `utmCampaign` from its caller. It does not read URL parameters itself. It generates a fresh event ID on each call and does not implement a durable retry queue. It does not capture or persist `ref`, store referral state in a first-party cookie, link a signup to a merchant account, or implement offline merchant billing replay. The Tracking view explicitly says link generation awaits a backend.

Browser events are labeled `unauthenticated_client`, Origin is `unverified_request_header`, and consent is `unverified_client_assertion`. Those labels are useful boundaries: Company Human must never mint commission from an unverified browser claim. Signed merchant events and authoritative billing provenance remain mandatory.

## Phase 07 consumption gate

Use this assessment for CH-42 through CH-47 after checking their current Notion acceptance. Re-read relevant Callix source at the pinned revision before copying code; preserve attribution/licensing requirements. Keep campaign UTMs separate from the stable referral token. Do not change merchant customer access based on Company Human state. Prove signup persistence, delayed delivery, duplicate and conflicting events, test/production isolation, and a real Chippi signup before accepting the phase.

Sources: [tracking backend](https://github.com/mosnin/callix/blob/6fb2f7c5b1fcfcd694172a09b5e94b2c190f9169/convex/tracking.ts), [browser helper](https://github.com/mosnin/callix/blob/6fb2f7c5b1fcfcd694172a09b5e94b2c190f9169/components/dashboard/tracking.tsx), [ingestion tests](https://github.com/mosnin/callix/blob/6fb2f7c5b1fcfcd694172a09b5e94b2c190f9169/tests/browser-pixel-ingestion.test.ts), [fixture ledger test](https://github.com/mosnin/callix/blob/6fb2f7c5b1fcfcd694172a09b5e94b2c190f9169/tests/attribution-ledger.test.ts).
