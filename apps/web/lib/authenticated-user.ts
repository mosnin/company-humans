import { auth, currentUser } from "@clerk/nextjs/server";
import { findCanonicalUser, syncClerkUser } from "@company-human/database/clerk-users";
import { UserIdSchema, type UserId } from "@company-human/contracts";

export type AuthenticatedUserResolution =
  | { status: "unauthenticated" }
  | { status: "unavailable" }
  | { status: "forbidden" }
  | { status: "ok"; userId: UserId };

/** Clerk proves the session; Company Human resolves its own global user record. */
export async function resolveAuthenticatedUser(): Promise<AuthenticatedUserResolution> {
  const databaseUrl = process.env.DATABASE_IDENTITY_URL;
  if (!databaseUrl || !process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return { status: "unavailable" };
  }
  const session = await auth();
  if (!session.userId) return { status: "unauthenticated" };
  const known = await findCanonicalUser(databaseUrl, session.userId);
  if (known) return { status: "ok", userId: UserIdSchema.parse(known) };

  // A fresh sign-in can precede webhook delivery. Fetch only the fields needed
  // for canonical identity; private metadata is never stored or returned.
  const providerUser = await currentUser();
  if (!providerUser || providerUser.id !== session.userId) return { status: "forbidden" };
  const primaryEmail = providerUser.emailAddresses.find((email) => email.id === providerUser.primaryEmailAddressId)?.emailAddress ?? null;
  const displayName = [providerUser.firstName, providerUser.lastName].filter(Boolean).join(" ").trim()
    || providerUser.username || primaryEmail || "User";
  await syncClerkUser(databaseUrl, {
    clerkUserId: providerUser.id,
    primaryEmail,
    displayName,
    status: "active",
    eventTimestamp: providerUser.updatedAt,
  });
  const userId = await findCanonicalUser(databaseUrl, providerUser.id);
  return userId ? { status: "ok", userId } : { status: "forbidden" };
}
