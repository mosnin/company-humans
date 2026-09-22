import { listMemberApplications } from "@company-human/database/rls";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
const states = {
  preparing: ["Being prepared", "Your organization is setting up your access."],
  suspended: ["Access paused", "Contact your administrator if you need this tool for your work."],
  unavailable: ["Currently unavailable", "Your administrator needs to review this connection."],
  access_check_required: ["Access needs verification", "Your organization has assigned this tool. Opening it is not available until access is verified."],
} as const;
export default async function MemberAppsPage() {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const apps = process.env.DATABASE_RUNTIME_URL
    ? await listMemberApplications(process.env.DATABASE_RUNTIME_URL, workspace.context.userId, workspace.context.organizationId).catch(() => null)
    : null;
  return <><PageHeader title="Your apps" description={`Tools assigned to you by ${workspace.organization.name}. Your organization sponsors access.`}/>
    {apps === null ? <p role="alert" className="t-body text-ink-2">Your apps could not be loaded. Please try again.</p>
      : apps.length === 0 ? <Card><CardContent><h2 className="t-title-3">No apps assigned yet</h2><p className="mt-3 t-body text-ink-2">Ask your administrator to enable the tools you need for your work.</p></CardContent></Card>
      : <div className="grid gap-4">{apps.map(app => <Card key={app.id}><CardContent>
        <h2 className="t-title-3">{app.name}</h2><p className="t-caption text-ink-3">{app.instanceKey}</p>
        <p className="mt-3 t-body-medium">{states[app.status][0]}</p><p className="mt-2 t-body text-ink-2">{states[app.status][1]}</p>
      </CardContent></Card>)}</div>}
  </>;
}
