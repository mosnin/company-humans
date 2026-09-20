import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkspace } from "@/lib/workspace";
export default async function WorkspacePage() {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const admin = workspace.context.capabilities.includes("members.manage");
  return <><PageHeader title={workspace.organization.name} description="Your organization workspace" />
    <Card><CardContent><h2 className="t-title-3">{admin ? "Bring your team together" : "You’re part of the team"}</h2>
      <p className="mt-3 t-body text-ink-2">{admin ? "Invite people, organize teams, and set their access." : "Your organization membership is active. Your team will let you know when work and applications are available."}</p>
      {admin && <Link href="/workspace/people" className="mt-5 inline-block t-link t-body-medium">Manage people</Link>}
    </CardContent></Card></>;
}
