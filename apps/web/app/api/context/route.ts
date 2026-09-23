import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OrganizationIdSchema } from "@company-human/contracts";
import { resolveAccessContext } from "@company-human/database/rls";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  const databaseUrl = process.env.DATABASE_RUNTIME_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Tenant database unavailable" }, { status: 503 });
  const selected = OrganizationIdSchema.safeParse((await cookies()).get("ch_active_org")?.value);
  if (!selected.success) return NextResponse.json({ error: "Select an organization" }, { status: 409 });
  try {
    const access = await resolveAccessContext(databaseUrl, identity.userId, selected.data);
    if (!access) return NextResponse.json({ error: "Organization unavailable" }, { status: 403 });
    return NextResponse.json({
      userId: access.userId, organizationId: access.organizationId, membershipId: access.membershipId,
      roleId: access.roleId, roleKey: access.roleKey, teamIds: access.teamIds, capabilities: access.capabilities,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Tenant database unavailable" }, { status: 503 });
  }
}
