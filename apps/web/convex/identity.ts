import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

export const current = query({
  args: {},
  returns: v.union(v.null(), v.object({
    subject: v.id("users"), name: v.string(), verifiedEmail: v.union(v.string(), v.null()), updatedAt: v.number(),
  })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!userId || !sessionId) return null;
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId || session.expirationTime <= Date.now()) return null;
    const user = await ctx.db.get(userId);
    if (!user || !user.profileUpdatedAt) return null;
    return {
      subject: user._id, name: user.name || "User", updatedAt: user.profileUpdatedAt,
      verifiedEmail: user.emailVerificationTime && user.email ? user.email : null,
    };
  },
});
