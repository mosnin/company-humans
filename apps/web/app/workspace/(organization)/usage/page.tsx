import { z } from "zod";
import { aggregateUsage } from "@company-human/database/usage-aggregation";
import { getWorkspace } from "@/lib/workspace";
import { UsageView } from "@/components/usage/usage-view";
export const dynamic = "force-dynamic";
const Query = z.object({ environment: z.enum(["production", "test"]), from: z.iso.date(), through: z.iso.date() }).strict()
  .refine(value => value.from <= value.through, "Invalid date range")
  .refine(value => value.through < "9999-12-31", "Invalid end date");
export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const capabilities = workspace.context.capabilities;
  const all = capabilities.includes("usage.read.all"), team = capabilities.includes("usage.read.team"), own = capabilities.includes("usage.read.own");
  if (!all && !team && !own) return <UsageView permitted={false}/>;
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const query = Query.safeParse({ environment: "production", from: first, through: last, ...await searchParams });
  const selection = query.success ? query.data : { environment: "production", from: first, through: last };
  let usage = null;
  if (query.success && process.env.DATABASE_RUNTIME_URL) {
    const until = new Date(`${query.data.through}T00:00:00Z`); until.setUTCDate(until.getUTCDate() + 1);
    usage = await aggregateUsage(process.env.DATABASE_RUNTIME_URL, workspace.context.userId, {
      organizationId: workspace.context.organizationId, environment: query.data.environment,
      from: `${query.data.from}T00:00:00Z`, until: until.toISOString(), breakdown: "product",
    }).catch(() => null);
  }
  const scope = all ? "All usage in this organization." : team && own ? "Your usage and usage attributed to teams you manage." : team ? "Usage attributed to teams you manage." : "Your own usage only.";
  return <UsageView permitted scope={scope} selection={selection} validQuery={query.success} usage={usage}/>;
}
