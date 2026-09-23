import { NextRequest, NextResponse } from "next/server";
import { revokeInvitation } from "@company-human/database/membership-lifecycle";
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
export const runtime = "nodejs";
export async function DELETE(request: NextRequest, context: { params: Promise<{ organizationId: string; invitationId: string }> }) {
  const denied = rejectCrossOriginMutation(request); if (denied) return denied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  if (!process.env.DATABASE_SERVICE_URL) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    await revokeInvitation(process.env.DATABASE_SERVICE_URL, { ...await context.params, actorUserId: identity.userId });
    return NextResponse.json({ status: "revoked" }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Invitation unavailable or revocation denied" }, { status: 403 }); }
}
