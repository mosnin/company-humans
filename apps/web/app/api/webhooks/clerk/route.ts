import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { syncClerkUser } from "@company-human/database/clerk-users";
import { normalizeClerkUserEvent } from "@/lib/clerk-user-event";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  const databaseUrl = process.env.DATABASE_URL;
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!databaseUrl || !signingSecret) return new Response("Webhook unavailable", { status: 503 });

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request, { signingSecret });
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }
  if (event.type !== "user.created" && event.type !== "user.updated" && event.type !== "user.deleted") {
    return new Response(null, { status: 204 });
  }
  try {
    const change = normalizeClerkUserEvent(event);
    await syncClerkUser(databaseUrl, change);
    return new Response(null, { status: 204 });
  } catch {
    return new Response("User synchronization failed", { status: 500 });
  }
}
