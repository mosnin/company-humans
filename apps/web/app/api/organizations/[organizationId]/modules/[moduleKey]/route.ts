import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrganizationIdSchema } from "@company-human/contracts";
import { setWorkspaceModule, WorkspaceModuleConflict, WorkspaceModuleDenied, WorkspaceModuleKeySchema } from "@company-human/database/workspace-modules";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  enabled: z.boolean(),
  expectedRevision: z.number().int().nonnegative().max(2147483646),
}).strict();
const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "cache-control": "no-store" },
});

export async function PUT(request: NextRequest, context: { params: Promise<{ organizationId: string; moduleKey: string }> }) {
  const originDenied = rejectCrossOriginMutation(request);
  if (originDenied) return originDenied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status !== "ok") return reply({ error: "Authentication or access unavailable" },
    identity.status === "unauthenticated" ? 401 : identity.status === "forbidden" ? 403 : 503);
  const params = await context.params;
  const organization = OrganizationIdSchema.safeParse(params.organizationId);
  const module = WorkspaceModuleKeySchema.safeParse(params.moduleKey);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!organization.success || !module.success || !body.success) return reply({ error: "Check the module settings." }, 400);
  // The catalog can store future configuration, but a public control must not
  // enable a native module with no working workspace experience yet.
  if (module.data !== "work") return reply({ error: "This module is not available yet." }, 422);
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return reply({ error: "Workspace settings are unavailable." }, 503);
  try {
    const setting = await setWorkspaceModule(databaseUrl, {
      actorUserId: identity.userId, organizationId: organization.data,
      moduleKey: module.data, ...body.data,
    });
    return reply({ setting }, 200);
  } catch (error) {
    if (error instanceof WorkspaceModuleConflict) return reply({ error: "This setting changed. Refresh and try again." }, 409);
    if (error instanceof WorkspaceModuleDenied) return reply({ error: "Workspace settings unavailable or permission denied." }, 403);
    return reply({ error: "Could not save the module setting. Try again shortly." }, 503);
  }
}
