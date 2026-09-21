import Link from "next/link";
import { readApplicationHealth } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { ApplicationHealth } from "@/components/administration/application-health";
export default async function ApplicationHealthPage({params}:{params:Promise<{instanceId:string}>}){
 const workspace=await getWorkspace();if(!workspace)return null;
 const context=workspace.context;
 if(!context.capabilities.includes("applications.manage"))return <PageHeader title="Application health restricted" description="Your role cannot inspect application connections."/>;
 const {instanceId}=await params;
 const result=process.env.DATABASE_SERVICE_URL ? await readApplicationHealth(process.env.DATABASE_SERVICE_URL,context.userId,context.organizationId,instanceId).then(health=>({health})).catch(()=>null) : null;
 if(!result)return <PageHeader title="Application health unavailable" description="Check your access or try again." actions={<Link className="t-link" href="/workspace/applications">Back to applications</Link>}/>;
 return <><PageHeader title="Application health" description="Review the latest recorded product connection check."/>
  <div className="mb-5 flex flex-wrap gap-4"><Link className="t-link" href="/workspace/applications">Back to applications</Link><Link className="t-link" href={`/workspace/applications/${instanceId}/members`}>Member access</Link></div>
  <ApplicationHealth health={result.health}/></>;
}
