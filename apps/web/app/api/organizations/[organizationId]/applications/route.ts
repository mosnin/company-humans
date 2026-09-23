import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { NextRequest, NextResponse } from "next/server";
import { OrganizationIdSchema, ProductIdSchema } from "@company-human/contracts";
import { requestCatalogProductInstance, listProductInstances } from "@company-human/database/product-instances";
import { resolveAccessContext } from "@company-human/database/rls";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

import { z } from "zod";
const SetupBody = z.object({productId: ProductIdSchema, mode: z.enum(["provisioned", "connected"]), instanceKey: z.string().max(64).regex(/^[a-z][a-z0-9-]*$/).default("primary")}).strict();

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
  const data = SetupBody.safeParse(body);
  const organizationId = OrganizationIdSchema.safeParse((await context.params).organizationId);
  if (!data.success || !organizationId.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const instanceId = await requestCatalogProductInstance(databaseUrl, {
      actorUserId: identity.userId, organizationId: organizationId.data,
      ...data.data,
    });
    return NextResponse.json({ instanceId }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && ["Instance mode cannot change during enable", "Disabled instance requires reconciliation before re-enabling"].includes(error.message)) return NextResponse.json({error:"Existing setup requires review. Refresh Applications before retrying."},{status:409});
    if (error instanceof Error && ["Application administration denied", "Product unavailable", "Product setup unavailable"].includes(error.message)) return NextResponse.json({error:"Application setup unavailable or permission denied"},{status:403});
    return NextResponse.json({error:"Could not request application setup. Please retry."},{status:503});
  }
}
