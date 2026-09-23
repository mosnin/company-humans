import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BudgetPolicyActionV1Schema, BudgetPolicyScopeV1Schema, BudgetPolicyStatusV1Schema,
  BudgetPolicyV1Schema, LimitQuantitySchema, LimitWindowSchema, OrganizationIdSchema,
  ProductIdSchema,
} from "@company-human/contracts";
import {
  BudgetPolicyDenied, BudgetPolicyInvalid, readBudgetPolicies, createBudgetPolicy,
} from "@company-human/database/budget-policies";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { rejectCrossOriginMutation } from "@/lib/mutation-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Meter = BudgetPolicyV1Schema.shape.meter;
const Query = z.object({
  productId: ProductIdSchema,
  meterKey: Meter.shape.meterKey,
  meterVersion: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(Meter.shape.meterVersion),
  unit: Meter.shape.unit,
}).strict();
const Body = z.object({
  productId: ProductIdSchema,
  meter: Meter,
  window: LimitWindowSchema,
  scope: BudgetPolicyScopeV1Schema,
  maximumQuantity: LimitQuantitySchema,
  action: BudgetPolicyActionV1Schema,
  status: BudgetPolicyStatusV1Schema,
}).strict();
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
const contextOrganization = async (context: { params: Promise<{ organizationId: string }> }) =>
  OrganizationIdSchema.safeParse((await context.params).organizationId);

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }): Promise<NextResponse> {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unauthenticated") return reply({ error: "Authentication required" }, 401);
  if (identity.status === "forbidden") return reply({ error: "User unavailable" }, 403);
  if (identity.status === "unavailable") return reply({ error: "Identity unavailable" }, 503);
  const organization = await contextOrganization(context);
  const entries = [...request.nextUrl.searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return reply({ error: "Invalid budget query" }, 400);
  const query = Query.safeParse(Object.fromEntries(entries));
  if (!organization.success || !query.success) return reply({ error: "Invalid budget query" }, 400);
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return reply({ error: "Budget policies unavailable" }, 503);
  try {
    const { productId, meterKey, meterVersion, unit } = query.data;
    const policies = await readBudgetPolicies(databaseUrl, {
      actorUserId: identity.userId, organizationId: organization.data, productId,
      meter: { meterKey, meterVersion, unit },
    });
    return reply({ policies, providerEnforcementConfirmed: false });
  } catch (error) {
    if (error instanceof BudgetPolicyDenied) return reply({ error: "Budget policies unavailable or permission denied" }, 403);
    if (error instanceof BudgetPolicyInvalid) return reply({ error: "Budget policy request invalid" }, 422);
    return reply({ error: "Budget policies unavailable" }, 503);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ organizationId: string }> }): Promise<NextResponse> {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unauthenticated") return reply({ error: "Authentication required" }, 401);
  if (identity.status === "forbidden") return reply({ error: "User unavailable" }, 403);
  if (identity.status === "unavailable") return reply({ error: "Identity unavailable" }, 503);
  const organization = await contextOrganization(context);
  if (!organization.success) return reply({ error: "Invalid organization" }, 400);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return reply({ error: "Invalid budget policy settings" }, 400);
  const databaseUrl = process.env.DATABASE_SERVICE_URL;
  if (!databaseUrl) return reply({ error: "Budget policies unavailable" }, 503);
  try {
    const policy = await createBudgetPolicy(databaseUrl, {
      ...body.data, actorUserId: identity.userId, organizationId: organization.data,
    });
    return reply({ policy, providerEnforcementConfirmed: false }, 201);
  } catch (error) {
    if (error instanceof BudgetPolicyDenied) return reply({ error: "Budget policies unavailable or permission denied" }, 403);
    if (error instanceof BudgetPolicyInvalid) return reply({ error: "Budget policy request invalid" }, 422);
    return reply({ error: "Could not save budget policy. Please retry." }, 503);
  }
}
