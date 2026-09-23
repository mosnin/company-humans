import { rejectCrossOriginMutation } from "@/lib/mutation-origin";
import { NextRequest, NextResponse } from "next/server";
import { OrganizationIdSchema } from "@company-human/contracts";
import { resolveAccessContext } from "@company-human/database/rls";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  const databaseUrl = process.env.DATABASE_RUNTIME_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Tenant database unavailable" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const organizationId = OrganizationIdSchema.safeParse(
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).organizationId : undefined,
  );
  if (!organizationId.success) return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
  try {
    const access = await resolveAccessContext(databaseUrl, identity.userId, organizationId.data);
    if (!access) return NextResponse.json({ error: "Organization unavailable" }, { status: 403 });
    const response = NextResponse.json({ organizationId: access.organizationId }, { headers: { "cache-control": "no-store" } });
    response.cookies.set("ch_active_org", access.organizationId, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Tenant database unavailable" }, { status: 503 });
  }
}
