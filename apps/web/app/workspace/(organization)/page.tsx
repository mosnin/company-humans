import { listHumanAssignments } from "@company-human/database/human-work";
import { readWorkspaceModules } from "@company-human/database/workspace-modules";
import { listMemberApplications } from "@company-human/database/rls";
import { PageHeader } from "@/components/ui/page-header";
import { HomeOverview } from "@/components/home/home-overview";
import { getWorkspace } from "@/lib/workspace";

export default async function WorkspacePage() {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const { context } = workspace;
  const admin = workspace.context.capabilities.includes("members.manage");
  const canReadUsage = workspace.context.capabilities.some(capability => ["usage.read.own", "usage.read.team", "usage.read.all"].includes(capability));
  const canReadWork = context.capabilities.includes("assignments.read.own");
  const runtimeUrl = process.env.DATABASE_RUNTIME_URL;
  const [modules, apps] = runtimeUrl ? await Promise.all([
    canReadWork ? readWorkspaceModules(runtimeUrl, { actorUserId: context.userId, organizationId: context.organizationId }).catch(() => null) : Promise.resolve(null),
    listMemberApplications(runtimeUrl, context.userId, context.organizationId).catch(() => null),
  ]) : [null, null];
  const workEnabled = canReadWork && modules?.find(setting => setting.moduleKey === "work")?.enabled === true;
  const workStatusUnavailable = canReadWork && modules === null;
  const work = workEnabled && runtimeUrl
    ? await listHumanAssignments(runtimeUrl, { actorUserId: context.userId, organizationId: context.organizationId, scope: "own", pageSize: 3 }).catch(() => null)
    : null;
  const actions = work?.items.filter(item => item.completion === null).map(item => ({ id: item.id, title: item.title, dueAt: item.dueAt })) ?? null;
  return <><PageHeader title={workspace.organization.name} description="Your organization workspace" />
    <HomeOverview admin={admin} canReadUsage={canReadUsage}
      workState={workStatusUnavailable ? "unavailable" : workEnabled ? "ready" : "off"}
      actions={actions} appRecordCount={apps?.length ?? null} />
  </>;
}
