import { NextRequest, NextResponse } from "next/server";
import { RolePermissionError, SetRolePermissionsSchema, setRolePermissions } from "@company-human/database/role-permissions";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export async function PUT(request: NextRequest, context: { params: Promise<{ organizationId: string; roleId: string }> }) {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status !== "ok") return NextResponse.json({ error: "Sign in or check your access" }, {
    status: identity.status === "unauthenticated" ? 401 : identity.status === "forbidden" ? 403 : 503,
  });
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const params = await context.params;
  const input = SetRolePermissionsSchema.safeParse({
    actorUserId: identity.userId, ...params,
    capabilities: body?.capabilities, expectedCapabilities: body?.expectedCapabilities,
  });
  if (!input.success) return NextResponse.json({ error: "Invalid permissions" }, { status: 400 });
  try {
    await setRolePermissions(databaseUrl, input.data);
    return NextResponse.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RolePermissionError) return NextResponse.json({ error: error.message }, { status: error.kind === "conflict" ? 409 : 403 });
    return NextResponse.json({ error: "Permission service unavailable" }, { status: 503 });
  }
}
