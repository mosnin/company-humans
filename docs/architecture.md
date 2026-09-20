# Architecture

Company Human is a separate product. The current code contains a Next.js web scaffold, a minimal standalone health API, and shared contract, database, and testing package boundaries. The web visual primitives come from Company OS Web. The API does not yet expose tenant or product operations. The planned planes in the canonical Notion specification are identity, control, commercial, human workspace, events, attribution and commission, developer integration, and specialized product data. None are implemented yet. Specialized products remain independent sources of truth.

See [migration assessment](migration-assessment.md) for the source audit and recorded auth/database incompatibility.

Phase 00 now defines version 1 event and audit envelopes in `@company-human/contracts`. Both carry canonical organization IDs and actor provenance. The server only signing subpath uses domain separated HMAC SHA-256 with stable JSON ordering and constant time comparison. Persistence, replay, key management, and audit immutability are later phase work.
