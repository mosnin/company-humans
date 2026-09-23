import Link from "next/link";
import { inspectMemberActivationReadiness } from "@company-human/database/member-activation-readiness";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { MemberActivationReadiness } from "@/components/administration/member-activation-readiness";

export default async function MemberActivationReadinessPage({ params }: { params: Promise<{ instanceId: string; mappingId: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const { context } = workspace;
  if (!context.capabilities.includes("applications.manage") || !context.capabilities.includes("budgets.manage"))
    return <PageHeader title="Activation readiness restricted" description="Your role cannot inspect application and usage limit readiness." />;
  const { instanceId, mappingId } = await params;
  const diagnostic = process.env.DATABASE_SERVICE_URL
    ? await inspectMemberActivationReadiness(process.env.DATABASE_SERVICE_URL, {
      actorUserId: context.userId, organizationId: context.organizationId,
      productMembershipId: mappingId, expectedProductInstanceId: instanceId,
    }).catch(() => null) : null;
  if (!diagnostic || !diagnostic.subject || diagnostic.subject.productInstanceId !== instanceId)
    return <PageHeader title="Activation readiness unavailable" description="We could not load this member's readiness in the selected application. Check your access or try again."
      actions={<Link className="t-link" href={`/workspace/applications/${instanceId}/members`}>Back to members</Link>} />;
  const member = diagnostic.subject.membershipId;
  return <><PageHeader title="Member activation readiness" description="Review saved access, capability, and usage limit evidence before enabling a connected application."
    actions={<Link className="t-link" href={`/workspace/applications/${instanceId}/members/${mappingId}/readiness`}>Refresh status</Link>} />
    <nav aria-label="Application readiness related pages" className="mb-5 flex flex-wrap gap-4 t-body">
      <Link className="t-link" href={`/workspace/applications/${instanceId}/members`}>Member access</Link>
      <Link className="t-link" href={`/workspace/applications/${instanceId}/entitlements?member=${member}`}>Entitlements</Link>
      <Link className="t-link" href={`/workspace/applications/${instanceId}/usage-limits?member=${member}`}>Usage limits</Link>
      <Link className="t-link" href={`/workspace/applications/${instanceId}/health`}>Connection health</Link>
    </nav>
    <MemberActivationReadiness diagnostic={diagnostic} />
  </>;
}
