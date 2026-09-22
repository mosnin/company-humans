import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Convex stores authentication state only. Canonical tenant data remains in PostgreSQL.
export default defineSchema({
  ...authTables,
  authEmailRequestLimits: defineTable({ key: v.string(), windowStart: v.number(), count: v.number() }).index("key", ["key"]),
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    profileUpdatedAt: v.optional(v.number()),
  }).index("email", ["email"]).index("phone", ["phone"]),
});
