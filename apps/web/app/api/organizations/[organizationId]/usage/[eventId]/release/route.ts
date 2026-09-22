import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrganizationIdSchema, EventIdSchema } from "@company-human/contracts";
import { releaseQuarantinedUsage } from "@company-human/database/usage-quarantine";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; eventId: string }> }): Promise<NextResponse> {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unauthenticated") return reply({ error: "Authentication required" }, 401);
  if (identity.status === "forbidden") return reply({ error: "User unavailable" }, 403);
  if (identity.status === "unavailable") return reply({ error: "Identity unavailable" }, 503);
  const params = await context.params;
  const organization = OrganizationIdSchema.safeParse(params.organizationId), event = EventIdSchema.safeParse(params.eventId);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!organization.success || !event.success || !body.success) return reply({ error: "Invalid usage release request" }, 400);
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return reply({ error: "Usage recovery unavailable" }, 503);
  try {
    const result = await releaseQuarantinedUsage(databaseUrl, { organizationId: organization.data, eventId: event.data, actorUserId: identity.userId, reason: body.data.reason });
    return reply({ released: result.released });
  } catch (error) {
    if (error instanceof Error && error.message === "Usage recovery unavailable or denied") return reply({ error: "Usage recovery unavailable or permission denied" }, 403);
    if (error instanceof Error && ["Usage is not quarantined", "Exact meter registration required"].includes(error.message)) return reply({ error: "Usage cannot be released. Check its quarantine state and exact meter registration." }, 409);
    return reply({ error: "Usage recovery unavailable" }, 503);
  }
}
