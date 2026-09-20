import { NextRequest, NextResponse } from "next/server";
import { changeMembershipStatus } from "@company-human/database/membership-lifecycle";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ organizationId: string; membershipId: string }> }): Promise<NextResponse> {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const action = (body as Record<string, unknown>).action;
  if (action !== "suspend" && action !== "reactivate" && action !== "remove") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { organizationId, membershipId } = await context.params;
  try {
    await changeMembershipStatus(databaseUrl, {
      actorUserId: identity.userId, organizationId,
      membershipId, action,
    });
    return NextResponse.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Membership change denied" }, { status: 403 });
  }
}
