import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrganizationIdSchema, ProductInstanceIdSchema, MembershipIdSchema, ProductCapabilityKeySchema, LimitQuantitySchema, LimitWindowSchema } from "@company-human/contracts";
import { setProductUsageLimit, UsageLimitConflict } from "@company-human/database/product-usage-limits";
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
const Body = z.object({
  membershipId: MembershipIdSchema.nullable(), meterKey: ProductCapabilityKeySchema, unit: ProductCapabilityKeySchema,
  window: LimitWindowSchema, maximumQuantity: LimitQuantitySchema, expectedRevision: z.number().int().min(0).max(2147483646),
}).strict();
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string; instanceId: string }> }): Promise<NextResponse> {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  const params = await context.params;
  const organizationId = OrganizationIdSchema.safeParse(params.organizationId), instanceId = ProductInstanceIdSchema.safeParse(params.instanceId);
  if (!organizationId.success || !instanceId.success) return NextResponse.json({ error: "Invalid application" }, { status: 400 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid usage limit settings" }, { status: 400 });
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const revision = await setProductUsageLimit(databaseUrl, { ...body.data, actorUserId: identity.userId, organizationId: organizationId.data, productInstanceId: instanceId.data });
    return NextResponse.json({ revision, providerEnforcementConfirmed: false }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof UsageLimitConflict) return NextResponse.json({ error: "Settings changed. Reload before saving." }, { status: 409 });
    if (error instanceof Error && error.message === "Meter unavailable") return NextResponse.json({ error: "Meter unavailable" }, { status: 422 });
    if (error instanceof Error && ["Usage limit unit is immutable", "Usage limit unit is immutable across scopes"].includes(error.message)) {
      return NextResponse.json({ error: "The unit is fixed for this meter. Reload its settings." }, { status: 422 });
    }
    if (error instanceof Error && ["Budget administration denied", "Product instance unavailable", "Membership unavailable"].includes(error.message)) {
      return NextResponse.json({ error: "Application unavailable or permission denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Could not save usage limit settings. Please retry." }, { status: 503 });
  }
}
