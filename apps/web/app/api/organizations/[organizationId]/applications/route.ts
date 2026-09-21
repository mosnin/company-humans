import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { NextRequest, NextResponse } from "next/server";
import { OrganizationIdSchema, ProductIdSchema, ProvisioningModeSchema } from "@company-human/contracts";
import { enableProductInstance, listProductInstances } from "@company-human/database/product-instances";
import { resolveAccessContext } from "@company-human/database/rls";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ organizationId: string }> }): Promise<NextResponse> {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  const databaseUrl = process.env.DATABASE_RUNTIME_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Tenant database unavailable" }, { status: 503 });
  const organizationId = OrganizationIdSchema.safeParse((await context.params).organizationId);
  if (!organizationId.success) return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
  try {
    const access = await resolveAccessContext(databaseUrl, identity.userId, organizationId.data);
    if (!access) return NextResponse.json({ error: "Organization unavailable" }, { status: 403 });
    const instances = await listProductInstances(databaseUrl, identity.userId, organizationId.data);
    return NextResponse.json({ instances }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Tenant database unavailable" }, { status: 503 });
  }
}

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
  const data = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const organizationId = OrganizationIdSchema.safeParse((await context.params).organizationId);
  const productId = ProductIdSchema.safeParse(data.productId);
  const mode = ProvisioningModeSchema.safeParse(data.mode);
  const instanceKey = typeof data.instanceKey === "string" ? data.instanceKey : "primary";
  if (!organizationId.success || !productId.success || !mode.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const instanceId = await enableProductInstance(databaseUrl, {
      actorUserId: identity.userId, organizationId: organizationId.data,
      productId: productId.data, mode: mode.data, instanceKey,
    });
    return NextResponse.json({ instanceId }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Application enable denied or invalid" }, { status: 403 });
  }
}
