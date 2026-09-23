import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HumanAssignmentIdSchema, OrganizationIdSchema } from "@company-human/contracts";
import { completeHumanAssignment, HumanWorkConflict, HumanWorkDenied } from "@company-human/database/human-work";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  outcome: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().min(1).max(4000).nullable(),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; assignmentId: string }> }) {
  const originDenied = rejectCrossOriginMutation(request);
  if (originDenied) return originDenied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status !== "ok") return NextResponse.json({ error: "Authentication or access unavailable" },
    { status: identity.status === "unauthenticated" ? 401 : identity.status === "forbidden" ? 403 : 503 });
  const params = await context.params;
  const organizationId = OrganizationIdSchema.safeParse(params.organizationId);
  const assignmentId = HumanAssignmentIdSchema.safeParse(params.assignmentId);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!organizationId.success || !assignmentId.success || !body.success) return NextResponse.json({ error: "Check the completion details." }, { status: 400 });
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Work is unavailable. Try again shortly." }, { status: 503 });
  try {
    await completeHumanAssignment(databaseUrl, { actorUserId: identity.userId, organizationId: organizationId.data, assignmentId: assignmentId.data, ...body.data });
    return NextResponse.json({ status: "reported_complete" }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof HumanWorkConflict) return NextResponse.json({ error: "This assignment was already reported complete." }, { status: 409 });
    if (error instanceof HumanWorkDenied) return NextResponse.json({ error: "Assignment unavailable or permission denied." }, { status: 403 });
    return NextResponse.json({ error: "Could not report completion. Try again shortly." }, { status: 503 });
  }
}
