import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkspace } from "@/lib/workspace";
export default async function WorkspacePage() {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const admin = workspace.context.capabilities.includes("members.manage");
  const canReadUsage = workspace.context.capabilities.some(capability => ["usage.read.own", "usage.read.team", "usage.read.all"].includes(capability));
  return <><PageHeader title={workspace.organization.name} description="Your organization workspace" />
    <Card><CardContent><h2 className="t-title-3">{admin ? "Bring your team together" : "You’re part of the team"}</h2>
      <p className="mt-3 t-body text-ink-2">{admin ? "Invite people, organize teams, and set their access." : "Review the apps assigned to you and their access status."}</p>
      <div className="mt-5 flex flex-wrap gap-5">
        <Link href="/workspace/apps" className="t-link t-body-medium">View your apps</Link>
        {canReadUsage && <Link href="/workspace/usage" className="t-link t-body-medium">View usage</Link>}
        {admin && <Link href="/workspace/people" className="t-link t-body-medium">Manage people</Link>}
      </div>
    </CardContent></Card></>;
}
