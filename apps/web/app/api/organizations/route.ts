import { NextRequest, NextResponse } from "next/server";
import { listVisibleOrganizations } from "@company-human/database/rls";
import { createOrganization } from "@company-human/database/organizations";
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  if (identity.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (identity.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { name, slug } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 256
    || typeof slug !== "string" || !/^[a-z][a-z0-9-]{2,62}$/.test(slug)) {
    return NextResponse.json({ error: "Invalid organization name or URL name" }, { status: 400 });
  }
  try {
    const created = await createOrganization(databaseUrl, { ownerUserId: identity.userId, name, slug });
    return NextResponse.json(created, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "That URL name is already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: "Organization could not be created" }, { status: 503 });
  }
}
