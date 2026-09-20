import { NextResponse } from "next/server";
import { listVisibleOrganizations } from "@company-human/database/rls";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const identity = await resolveAuthenticatedUser();
    if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
    if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });

    const runtimeUrl = process.env.DATABASE_RUNTIME_URL;
    if (!runtimeUrl) return NextResponse.json({ error: "Tenant database unavailable" }, { status: 503 });
    const organizations = await listVisibleOrganizations(runtimeUrl, identity.userId);
    return NextResponse.json({ organizations }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Tenant database unavailable" }, { status: 503 });
  }
}
