import { z } from "zod";
import { OrganizationIdSchema, ProductIdSchema, ProductInstanceIdSchema, SignedUsageEventV1Schema } from "@company-human/contracts";
import { verifyEventEnvelope } from "@company-human/contracts/signing";
import type { UsageSigningAuthority } from "@company-human/database/usage-ingestion";
const Config = z.array(z.object({
  keyId: z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/), secretEnv: z.string().regex(/^USAGE_SIGNING_KEY_[A-Z0-9_]+$/),
  organizationId: OrganizationIdSchema, productId: ProductIdSchema, productInstanceId: ProductInstanceIdSchema,
  sourceSystem: z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/), environment: z.enum(["test","production"]),
  notBefore: z.iso.datetime({offset:true}), expiresAt: z.iso.datetime({offset:true}), revoked: z.boolean(),
}).strict()).max(1000).refine(rows => new Set(rows.map(row => row.keyId)).size === rows.length);

/** Environment configuration is controlled by operators, never supplied by callers.
 * Secret values live in separate server environment references, not in the registry JSON.
 */
export function resolveUsageAuthority(input: unknown, env: NodeJS.ProcessEnv = process.env, now = Date.now()): UsageSigningAuthority {
  const config = Config.parse(JSON.parse(env.USAGE_SIGNING_AUTHORITIES ?? "[]"));
  const event = SignedUsageEventV1Schema.parse(input);
  const entry = config.find(row => row.keyId === event.signature.keyId);
  if (!entry || entry.revoked || Date.parse(entry.notBefore) > now || Date.parse(entry.expiresAt) <= now) throw new Error("Usage authentication denied");
  const secret = env[entry.secretEnv];
  if (!secret || !/^[a-f0-9]{64,128}$/.test(secret) || secret.length % 2) throw new Error("Usage authentication denied");
  const authority: UsageSigningAuthority = { ...entry, key: Buffer.from(secret,"hex") };
  // Verify original signed bytes before using normalized numeric fields.
  verifyEventEnvelope(input, id => id === authority.keyId ? authority.key : undefined);
  if (event.organizationId !== entry.organizationId || event.productId !== entry.productId || event.payload.productInstanceId !== entry.productInstanceId
    || event.environment !== entry.environment || event.source.system !== entry.sourceSystem) throw new Error("Usage authentication denied");
  return authority;
}
