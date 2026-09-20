import { ClerkUserChangeSchema, type ClerkUserChange } from "@company-human/database/clerk-users";
import { z } from "zod";

const ClerkUserEventSchema = z.object({
  type: z.enum(["user.created", "user.updated", "user.deleted"]),
  timestamp: z.number().int().nonnegative(),
  data: z.object({
    id: z.string(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    primary_email_address_id: z.string().nullable().optional(),
    email_addresses: z.array(z.object({ id: z.string(), email_address: z.string() })).optional(),
  }).passthrough(),
}).passthrough();

export function normalizeClerkUserEvent(input: unknown): ClerkUserChange {
  const event = ClerkUserEventSchema.parse(input);
  const email = event.data.email_addresses?.find((item) => item.id === event.data.primary_email_address_id)?.email_address ?? null;
  const fullName = [event.data.first_name, event.data.last_name].filter(Boolean).join(" ").trim();
  const displayName = fullName || event.data.username || email || "User";
  return ClerkUserChangeSchema.parse({
    clerkUserId: event.data.id,
    primaryEmail: event.type === "user.deleted" ? null : email,
    displayName: event.type === "user.deleted" ? "Deleted user" : displayName,
    status: event.type === "user.deleted" ? "deleted" : "active",
    eventTimestamp: event.timestamp,
  });
}
