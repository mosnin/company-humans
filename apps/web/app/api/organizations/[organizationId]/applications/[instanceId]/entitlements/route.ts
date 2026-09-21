import { NextRequest, NextResponse } from "next/server";
import { OrganizationIdSchema, ProductInstanceIdSchema, MembershipIdSchema, ProductCapabilityKeySchema, EntitlementEffectSchema } from "@company-human/contracts";
import { setProductEntitlement, EntitlementConflict } from "@company-human/database/product-entitlements";
import { z } from "zod";
const Body = z.object({ membershipId: MembershipIdSchema.nullable(), capability: ProductCapabilityKeySchema, effect: EntitlementEffectSchema, expectedRevision: z.number().int().min(0).max(2147483646) }).strict();
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
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
  const organizationId = OrganizationIdSchema.safeParse(params.organizationId);
  const instanceId = ProductInstanceIdSchema.safeParse(params.instanceId);
  if (!organizationId.success || !instanceId.success) return NextResponse.json({ error: "Invalid application" }, { status: 400 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid entitlement settings" }, { status: 400 });
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const revision = await setProductEntitlement(databaseUrl, { ...body.data, actorUserId: identity.userId, organizationId: organizationId.data, productInstanceId: instanceId.data });
    return NextResponse.json({ revision, providerAccessConfirmed: false }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof EntitlementConflict) return NextResponse.json({ error: "Settings changed. Reload before saving." }, { status: 409 });
    if (error instanceof Error && error.message === "Capability unavailable") return NextResponse.json({ error: "Capability unavailable" }, { status: 422 });
    if (error instanceof Error && ["Application administration denied", "Product instance unavailable", "Membership unavailable"].includes(error.message)) {
      return NextResponse.json({ error: "Application unavailable or permission denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Could not save entitlement settings. Please retry." }, { status: 503 });
  }
}
