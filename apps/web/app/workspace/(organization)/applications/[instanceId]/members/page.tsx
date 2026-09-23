import Link from "next/link";
import { listApplicationMemberDiagnostics } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { ApplicationMembers } from "@/components/administration/application-members";
export default async function ApplicationMembersPage({params,searchParams}:{params:Promise<{instanceId:string}>;searchParams:Promise<{page?:string}>}) {
  const workspace=await getWorkspace();if(!workspace)return null;
  const context=workspace.context;
  if(!context.capabilities.includes('applications.manage')) return <PageHeader title="Application members restricted" description="Your role cannot administer workspace applications." />;
  const {instanceId}=await params;
  const page=Number((await searchParams).page??1);
  const data=process.env.DATABASE_SERVICE_URL?await listApplicationMemberDiagnostics(process.env.DATABASE_SERVICE_URL,context.userId,context.organizationId,instanceId,page).catch(()=>null):null;
  if(!data)return <PageHeader title="Application members unavailable" description="We could not load this application's members. Check your access or try again." actions={<Link className="t-link" href="/workspace/applications">Back to applications</Link>} />;
  return <><PageHeader title={`${data.productName} members`} description="Review requested access and the latest suspension or removal progress." actions={<Link className="t-link" href={`/workspace/applications/${instanceId}/members`}>Refresh status</Link>} />
    <Link className="mb-4 inline-block t-link" href="/workspace/applications">Back to applications</Link>
    <Link className="ml-4 inline-block t-link" href={`/workspace/applications/${instanceId}/members/request`}>Request member access</Link>
    <ApplicationMembers instanceId={instanceId} members={data.members} canInspectReadiness={context.capabilities.includes('budgets.manage')} />
    <nav aria-label="Application member pages" className="mt-4 flex justify-between gap-4 t-body"><span>{data.total} mapped members</span><div className="flex gap-4">{data.page>1&&<Link className="t-link" href={`?page=${data.page-1}`}>Previous</Link>}{data.page*50<data.total&&<Link className="t-link" href={`?page=${data.page+1}`}>Next</Link>}</div></nav>
  </>;
}
