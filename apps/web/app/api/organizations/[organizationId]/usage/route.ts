import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrganizationIdSchema, ProductInstanceIdSchema, MembershipIdSchema, TeamIdSchema, ProductCapabilityKeySchema } from "@company-human/contracts";
import { aggregateUsage } from "@company-human/database/usage-aggregation";
import { resolveAccessContext } from "@company-human/database/rls";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Timestamp = z.iso.datetime({ offset: true }).regex(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);
const Query = z.object({
  environment: z.enum(["test", "production"]),
  from: Timestamp,
  until: Timestamp,
  breakdown: z.enum(["organization", "product", "instance", "team", "member", "capability"]),
  productInstanceId: ProductInstanceIdSchema.optional(),
  membershipId: MembershipIdSchema.optional(),
  teamId: TeamIdSchema.optional(),
  capabilityKey: ProductCapabilityKeySchema.optional(),
}).strict()
  .refine(value => Date.parse(value.from) < Date.parse(value.until), "Invalid usage window")
  .refine(value => value.capabilityKey === undefined || value.breakdown === "capability", "Capability filter requires capability breakdown");
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: NextRequest, context: { params: Promise<{ organizationId: string }> }): Promise<NextResponse> {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unauthenticated") return reply({ error: "Authentication required" }, 401);
  if (identity.status === "forbidden") return reply({ error: "User unavailable" }, 403);
  if (identity.status === "unavailable") return reply({ error: "Identity unavailable" }, 503);
  const organization = OrganizationIdSchema.safeParse((await context.params).organizationId);
  const entries = [...request.nextUrl.searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return reply({ error: "Invalid usage query" }, 400);
  const query = Query.safeParse(Object.fromEntries(entries));
  if (!organization.success || !query.success) return reply({ error: "Invalid usage query" }, 400);
  const databaseUrl = process.env.DATABASE_RUNTIME_URL;
  if (!databaseUrl) return reply({ error: "Usage unavailable" }, 503);
  try {
    const access = await resolveAccessContext(databaseUrl, identity.userId, organization.data);
    if (!access || !access.capabilities.some(capability => ["usage.read.own", "usage.read.team", "usage.read.all"].includes(capability))) {
      return reply({ error: "Usage unavailable or permission denied" }, 403);
    }
    const usage = await aggregateUsage(databaseUrl, identity.userId, { organizationId: organization.data, ...query.data });
    return reply({ scope: "permitted-usage", window: query.data, usage });
  } catch {
    return reply({ error: "Usage unavailable" }, 503);
  }
}
