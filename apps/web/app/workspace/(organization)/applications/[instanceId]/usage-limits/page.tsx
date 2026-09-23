import Link from "next/link";
import { readApplicationUsageLimits } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { UsageLimitEditor } from "@/components/administration/usage-limits";
export default async function UsageLimitsPage({ params, searchParams }: { params: Promise<{ instanceId: string }>; searchParams: Promise<{ member?: string }> }) {
  const workspace = await getWorkspace(); if (!workspace) return null;
  const context = workspace.context;
  if (!context.capabilities.includes("budgets.manage")) return <PageHeader title="Usage limits restricted" description="Your role cannot administer workspace usage limits." />;
  const { instanceId } = await params; const member = (await searchParams).member ?? null;
  const data = process.env.DATABASE_SERVICE_URL ? await readApplicationUsageLimits(process.env.DATABASE_SERVICE_URL, context.userId, context.organizationId, instanceId, member).catch(() => null) : null;
  if (!data) return <PageHeader title="Usage limits unavailable" description="Check your access or try again." actions={<Link className="t-link" href="/workspace/applications">Back to applications</Link>} />;
  return <><PageHeader title={`${data.productName} usage limits`} description={member ? `Member limits for ${data.memberName}` : "Organization limits"} />
    <div className="mb-5 flex flex-wrap gap-4"><Link className="t-link" href="/workspace/applications">Back to applications</Link><Link className="t-link" href={`/workspace/applications/${instanceId}/members`}>Member access</Link>{member && <Link className="t-link" href={`/workspace/applications/${instanceId}/usage-limits`}>Organization limits</Link>}</div>
    <UsageLimitEditor data={data} organizationId={context.organizationId} instanceId={instanceId} /></>;
}
