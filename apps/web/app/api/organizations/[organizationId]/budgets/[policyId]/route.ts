import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BudgetIdSchema, BudgetPolicyActionV1Schema, BudgetPolicyStatusV1Schema,
  LimitQuantitySchema, OrganizationIdSchema,
} from "@company-human/contracts";
import {
  BudgetPolicyConflict, BudgetPolicyDenied, BudgetPolicyInvalid, reviseBudgetPolicy,
} from "@company-human/database/budget-policies";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  expectedRevision: z.number().int().positive().max(2147483646),
  maximumQuantity: LimitQuantitySchema,
  action: BudgetPolicyActionV1Schema,
  status: BudgetPolicyStatusV1Schema,
}).strict();
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function PATCH(request: NextRequest, context: { params: Promise<{ organizationId: string; policyId: string }> }): Promise<NextResponse> {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unauthenticated") return reply({ error: "Authentication required" }, 401);
  if (identity.status === "forbidden") return reply({ error: "User unavailable" }, 403);
  if (identity.status === "unavailable") return reply({ error: "Identity unavailable" }, 503);
  const params = await context.params;
  const organization = OrganizationIdSchema.safeParse(params.organizationId);
  const policyId = BudgetIdSchema.safeParse(params.policyId);
  if (!organization.success || !policyId.success) return reply({ error: "Invalid budget policy" }, 400);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return reply({ error: "Invalid budget policy settings" }, 400);
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return reply({ error: "Budget policies unavailable" }, 503);
  try {
    const policy = await reviseBudgetPolicy(databaseUrl, {
      ...body.data, actorUserId: identity.userId, organizationId: organization.data, policyId: policyId.data,
    });
    return reply({ policy, providerEnforcementConfirmed: false });
  } catch (error) {
    if (error instanceof BudgetPolicyConflict) return reply({ error: "Settings changed. Reload before saving." }, 409);
    if (error instanceof BudgetPolicyDenied) return reply({ error: "Budget policies unavailable or permission denied" }, 403);
    if (error instanceof BudgetPolicyInvalid) return reply({ error: "Budget policy request invalid" }, 422);
    return reply({ error: "Could not save budget policy. Please retry." }, 503);
  }
}
