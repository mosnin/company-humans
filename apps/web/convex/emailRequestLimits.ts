import type { MutationCtx } from "./_generated/server";
import type { ConvexAuthConfig } from "@convex-dev/auth/server";
type AuthContext = Parameters<NonNullable<NonNullable<ConvexAuthConfig["callbacks"]>["createOrUpdateUser"]>>[0];

// All email requests go through the auth mutation, including direct API callers.
// Transactional counters reserve capacity before token creation or paid delivery.
export async function reserveEmailRequest(ctx: AuthContext, email: string) {
  // Convex Auth exposes a generic context; this callback runs against our schema.
  const db = ctx.db as MutationCtx["db"];
  const now = Date.now();
  for (const [key, limit] of [[`email:${email}`, 5], ["global", 1000]] as const) {
    const row = await db.query("authEmailRequestLimits").withIndex("key", q => q.eq("key", key)).unique();
    if (!row) {
      await db.insert("authEmailRequestLimits", { key, windowStart: now, count: 1 });
    } else if (now - row.windowStart >= 60 * 60 * 1000) {
      await db.patch(row._id, { windowStart: now, count: 1 });
    } else if (row.count >= limit) {
      throw new Error("Too many sign-in requests. Please try again later.");
    } else {
      await db.patch(row._id, { count: row.count + 1 });
    }
  }
}
