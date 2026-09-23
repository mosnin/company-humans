import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { NextRequest, NextResponse } from "next/server";
import { acceptInvitation } from "@company-human/database/membership-lifecycle";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const identity = await resolveAuthenticatedUser({ requireVerifiedEmail: true }).catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  if (!identity.verifiedEmail) return NextResponse.json({ error: "Verified email required" }, { status: 403 });
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).token !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const membershipId = await acceptInvitation(databaseUrl, (body as { token: string }).token, identity.userId, identity.verifiedEmail);
    return NextResponse.json({ membershipId }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Invitation unavailable" }, { status: 403 });
  }
}
