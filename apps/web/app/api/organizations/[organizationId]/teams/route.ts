import { NextRequest, NextResponse } from "next/server";
import { createTeam } from "@company-human/database/teams";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status !== "ok") return NextResponse.json({ error: "Authentication or access unavailable" }, { status: identity.status === "unauthenticated" ? 401 : identity.status === "forbidden" ? 403 : 503 });
  const url = process.env.DATABASE_SERVICE_URL;
  if (!url) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (typeof body?.name !== "string" || !body.name.trim() || body.name.trim().length > 128) return NextResponse.json({ error: "Enter a team name of 1–128 characters" }, { status: 400 });
  try {
    const { organizationId } = await context.params;
    const id = await createTeam(url, { actorUserId: identity.userId, organizationId, name: body.name });
    return NextResponse.json({ id }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not create team. Check your access and team name." }, { status: 403 }); }
}
