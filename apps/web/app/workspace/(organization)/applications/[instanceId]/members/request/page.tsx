import Link from "next/link";
import { listApplicationMemberCandidates } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input } from "@/components/administration/controls";
import { Button } from "@/components/ui/button";
import { RequestApplicationMembers } from "@/components/administration/request-application-members";
export default async function RequestMembersPage({params,searchParams}:{params:Promise<{instanceId:string}>;searchParams:Promise<{q?:string;page?:string}>}) {
  const workspace=await getWorkspace();if(!workspace)return null;
  const c=workspace.context;
  if(!c.capabilities.includes('applications.manage'))return <PageHeader title="Application members restricted" description="Your role cannot administer workspace applications." />;
  const {instanceId}=await params;const query=await searchParams;
  const data=process.env.DATABASE_SERVICE_URL?await listApplicationMemberCandidates(process.env.DATABASE_SERVICE_URL,c.userId,c.organizationId,instanceId,query.q??'',Number(query.page??1)).catch(()=>null):null;
  const back=<Link className="t-link" href={`/workspace/applications/${instanceId}/members`}>Back to member access</Link>;
  if(!data)return <PageHeader title="Member selection unavailable" description="Check your access or try again." actions={back} />;
  if(!data.available)return <PageHeader title="Application is not ready" description="The organization connection must be active before new member access can be requested." actions={back} />;
  return <><PageHeader title={`Request ${data.productName} access`} description="Choose an active workspace member. Requests do not grant access until provisioning and access policies are confirmed." actions={back} />
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Field label="Search members"><Input name="q" defaultValue={data.search} maxLength={128} /></Field></div><Button type="submit">Search</Button></form>
    <RequestApplicationMembers members={data.members} organizationId={c.organizationId} instanceId={instanceId} />
    <nav aria-label="Eligible member pages" className="mt-4 flex flex-wrap justify-between gap-4 t-body"><span>{data.total} eligible members</span><div className="flex gap-4">{data.page>1&&<Link className="t-link" href={`?q=${encodeURIComponent(data.search)}&page=${data.page-1}`}>Previous</Link>}{data.page*50<data.total&&<Link className="t-link" href={`?q=${encodeURIComponent(data.search)}&page=${data.page+1}`}>Next</Link>}</div></nav></>;
}
