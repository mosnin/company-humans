import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MembershipIdSchema, OrganizationIdSchema, TeamIdSchema } from "@company-human/contracts";
import { createHumanAssignment, HumanWorkDenied } from "@company-human/database/human-work";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  assigneeMembershipId: MembershipIdSchema,
  teamId: TeamIdSchema.nullable(),
  title: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(2000),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  priority: z.enum(["low", "normal", "high"]),
  expectedOutcome: z.string().trim().min(1).max(2000),
  evidenceRequired: z.boolean(),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }) {
  const originDenied = rejectCrossOriginMutation(request);
  if (originDenied) return originDenied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status !== "ok") return NextResponse.json({ error: "Authentication or access unavailable" },
    { status: identity.status === "unauthenticated" ? 401 : identity.status === "forbidden" ? 403 : 503 });
  const organizationId = OrganizationIdSchema.safeParse((await context.params).organizationId);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!organizationId.success || !body.success) return NextResponse.json({ error: "Check the assignment details." }, { status: 400 });
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Work is unavailable. Try again shortly." }, { status: 503 });
  try {
    const assignment = await createHumanAssignment(databaseUrl, { actorUserId: identity.userId, organizationId: organizationId.data, ...body.data });
    return NextResponse.json({ assignmentId: assignment.id }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof HumanWorkDenied) return NextResponse.json({ error: "Assignment unavailable or permission denied." }, { status: 403 });
    return NextResponse.json({ error: "Could not assign work. Try again shortly." }, { status: 503 });
  }
}
