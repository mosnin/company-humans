import Link from "next/link";
import { readApplicationEntitlements } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { EntitlementEditor } from "@/components/administration/entitlements";
export default async function EntitlementsPage({params,searchParams}:{params:Promise<{instanceId:string}>;searchParams:Promise<{member?:string}>}) {
  const workspace=await getWorkspace();if(!workspace)return null;
  const context=workspace.context;
  if(!context.capabilities.includes('applications.manage'))return <PageHeader title="Application settings restricted" description="Your role cannot administer workspace applications." />;
  const {instanceId}=await params;const member=(await searchParams).member??null;
  const data=process.env.DATABASE_SERVICE_URL?await readApplicationEntitlements(process.env.DATABASE_SERVICE_URL,context.userId,context.organizationId,instanceId,member).catch(()=>null):null;
  if(!data)return <PageHeader title="Application settings unavailable" description="Check your access or try again." actions={<Link className="t-link" href="/workspace/applications">Back to applications</Link>} />;
  return <><PageHeader title={`${data.productName} access settings`} description={member?`Member overrides for ${data.memberName}`:'Organization defaults'} />
    <div className="mb-5 flex flex-wrap gap-4"><Link className="t-link" href="/workspace/applications">Back to applications</Link><Link className="t-link" href={`/workspace/applications/${instanceId}/members`}>Member access</Link>{member&&<Link className="t-link" href={`/workspace/applications/${instanceId}/entitlements`}>Organization defaults</Link>}</div>
    <EntitlementEditor data={data} organizationId={context.organizationId} instanceId={instanceId} /></>;
}
