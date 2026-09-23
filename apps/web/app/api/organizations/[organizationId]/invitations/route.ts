import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { NextRequest, NextResponse } from "next/server";
import { inviteMember } from "@company-human/database/membership-lifecycle";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }): Promise<NextResponse> {
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
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = body as Record<string, unknown>;
  if (typeof data.recipientEmail !== "string" || typeof data.roleKey !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { organizationId } = await context.params;
  try {
    const invitation = await inviteMember(databaseUrl, {
      actorUserId: identity.userId,
      organizationId,
      recipientEmail: data.recipientEmail,
      roleKey: data.roleKey as "admin" | "manager" | "contributor" | "finance" | "developer",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return NextResponse.json({ ...invitation, invitePath: `/invite#${invitation.token}` },
      { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Invitation denied or invalid" }, { status: 403 });
  }
}
