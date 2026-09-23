import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { NextRequest, NextResponse } from "next/server";
import { changeMembershipRole } from "@company-human/database/organization-authority";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ organizationId: string; membershipId: string }> }): Promise<NextResponse> {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const roleKey = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).roleKey : undefined;
  if (typeof roleKey !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { organizationId, membershipId } = await context.params;
  try {
    await changeMembershipRole(databaseUrl, { actorUserId: identity.userId, organizationId, membershipId, roleKey });
    return NextResponse.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Role change denied" }, { status: 403 });
  }
}
