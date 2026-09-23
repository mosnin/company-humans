import { findCanonicalUser } from "@company-human/database/auth-users";
import { type UserId } from "@company-human/contracts";
import { readProviderIdentity } from "./provider-identity";
export type AuthenticatedUserResolution =
  | { status: "unauthenticated" } | { status: "unavailable" } | { status: "forbidden" }
  | { status: "ok"; userId: UserId; verifiedEmail?: string };

/** Read-only on every request; canonical synchronization happens via same-origin POST. */
export async function resolveAuthenticatedUser(options: { requireVerifiedEmail?: boolean } = {}): Promise<AuthenticatedUserResolution> {
  const databaseUrl = process.env.DATABASE_IDENTITY_URL;
  if (!databaseUrl) return { status: "unavailable" };
  const identity = await readProviderIdentity();
  if (identity.status !== "ok") return identity;
  if (options.requireVerifiedEmail && !identity.profile.verifiedEmail) return { status: "forbidden" };
  const userId = await findCanonicalUser(databaseUrl, identity.issuer, identity.profile.subject);
  return userId ? { status: "ok", userId, verifiedEmail: identity.profile.verifiedEmail ?? undefined } : { status: "forbidden" };
}
