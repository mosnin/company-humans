import type { ConvexAuthConfig } from "@convex-dev/auth/server";
type AuthMutationContext = Parameters<NonNullable<NonNullable<ConvexAuthConfig["callbacks"]>["createOrUpdateUser"]>>[0];
import type { Id } from "./_generated/dataModel";

export async function saveOAuthUser(
  ctx: AuthMutationContext,
  args: { existingUserId: Id<"users"> | null; profile: Record<string, unknown> },
): Promise<Id<"users">> {
  const { email, emailVerified, name } = args.profile;
  if (typeof email !== "string" || emailVerified !== true || !email.includes("@")) {
    throw new Error("A verified email address is required");
  }
  const data = {
    email: email.toLowerCase(), name: typeof name === "string" ? name.slice(0, 256) : email,
    emailVerificationTime: Date.now(), profileUpdatedAt: Date.now(),
  };
  // Only an existing provider account may resolve an existing identity.
  // Matching email addresses never merge accounts or inherit tenant access.
  if (args.existingUserId) {
    if (!(await ctx.db.get(args.existingUserId))) throw new Error("Account unavailable");
    await ctx.db.patch(args.existingUserId, data);
    return args.existingUserId;
  }
  return await ctx.db.insert("users", data);
}
