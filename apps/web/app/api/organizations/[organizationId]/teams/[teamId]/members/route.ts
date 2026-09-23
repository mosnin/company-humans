import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { NextRequest, NextResponse } from "next/server";
import { MembershipIdSchema, OrganizationIdSchema, TeamIdSchema } from "@company-human/contracts";
import { assignTeamMember } from "@company-human/database/teams";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export async function PUT(request: NextRequest, context: { params: Promise<{ organizationId: string; teamId: string }> }) {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status !== "ok") return NextResponse.json({ error: "Authentication or access unavailable" }, { status: identity.status === "unauthenticated" ? 401 : identity.status === "forbidden" ? 403 : 503 });
  const url = process.env.DATABASE_SERVICE_URL;
  if (!url) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const params = await context.params;
  const organization = OrganizationIdSchema.safeParse(params.organizationId);
  const team = TeamIdSchema.safeParse(params.teamId);
  const member = MembershipIdSchema.safeParse(body?.membershipId);
  if (!organization.success || !team.success || !member.success || !["manager", "member"].includes(body?.teamRole)) return NextResponse.json({ error: "Invalid team assignment" }, { status: 400 });
  try {
    await assignTeamMember(url, { actorUserId: identity.userId, organizationId: organization.data, teamId: team.data, membershipId: member.data, teamRole: body.teamRole });
    return NextResponse.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Team assignment denied" }, { status: 403 }); }
}
