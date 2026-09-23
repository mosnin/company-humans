import { readWorkspaceModules } from "@company-human/database/workspace-modules";
import { listAssignableMembers, listHumanAssignments } from "@company-human/database/human-work";
import { PageHeader } from "@/components/ui/page-header";
import { WorkBoard, type WorkCandidate, type WorkItem } from "@/components/work/work-board";
import { getWorkspace } from "@/lib/workspace";

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ view?: string; offset?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const { context } = workspace;
  if (!context.capabilities.some(capability => ["assignments.read.own", "assignments.read.team", "assignments.read.all"].includes(capability)))
    return <PageHeader title="Work access restricted" description="Your role cannot view human assignments." />;
  const runtimeUrl = process.env.DATABASE_RUNTIME_URL;
  if (!runtimeUrl) return <PageHeader title="Work unavailable" description="We could not load your assignments. Try again shortly." />;
  const modules = await readWorkspaceModules(runtimeUrl, { actorUserId: context.userId, organizationId: context.organizationId }).catch(() => null);
  if (!modules) return <PageHeader title="Work unavailable" description="We could not check this workspace's modules. Try again shortly." />;
  if (!modules.find(setting => setting.moduleKey === "work")?.enabled)
    return <PageHeader title="Work is turned off" description="Your organization has disabled the Work module." />;

  const canManageAll = context.capabilities.includes("assignments.manage.all") && context.capabilities.includes("assignments.read.all");
  const canManageTeam = !context.capabilities.includes("assignments.manage.all")
    && context.capabilities.includes("assignments.manage.team") && context.capabilities.includes("assignments.read.team");
  const canManage = canManageAll || canManageTeam;
  const query = await searchParams;
  const view = query.view === "team" && canManage ? "team" : "mine";
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) return <PageHeader title="Invalid work page" description="Choose a valid page of assignments." />;
  const serviceUrl = process.env.DATABASE_SERVICE_URL;
  if (view === "team" && !serviceUrl) return <PageHeader title="Work unavailable" description="We could not load team assignments. Try again shortly." />;
  const scope = view === "mine" ? "own" : canManageAll ? "all" : "team";
  const url = scope === "own" ? runtimeUrl : serviceUrl!;
  const data = await Promise.all([
    listHumanAssignments(url, { actorUserId: context.userId, organizationId: context.organizationId, scope, offset, pageSize: 50 }),
    view === "team" ? listAssignableMembers(serviceUrl!, { actorUserId: context.userId, organizationId: context.organizationId, teamId: null }) : Promise.resolve([]),
  ]).catch(() => null);
  if (!data) return <PageHeader title="Work unavailable" description="We could not load assignments for your role. Try again shortly." />;
  const [assignmentPage, candidates] = data;
  const items: WorkItem[] = assignmentPage.items.map(item => ({
    id: item.id,
    title: item.title,
    objective: item.objective,
    dueAt: item.dueAt,
    priority: item.priority,
    expectedOutcome: item.expectedOutcome,
    evidenceRequired: item.evidenceRequired,
    assigneeDisplayName: item.assigneeDisplayName || (view === "mine" ? "you" : "a team member"),
    completion: item.completion ? { outcome: item.completion.outcome, evidence: item.completion.evidence, completedAt: item.completion.reportedAt } : null,
  }));
  const members: WorkCandidate[] = candidates.map(candidate => ({
    membershipId: candidate.membershipId,
    displayName: candidate.displayName,
    teamId: candidate.teamId,
    teamName: candidate.teamName,
  }));
  const now = new Date();
  const todayEndIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
  return <><PageHeader title="Work" description={view === "mine" ? "Your human assignments and reported results." : "Assign work and review your team's reports."} />
    <WorkBoard organizationId={context.organizationId} items={items} candidates={members} view={view} canManage={canManage} todayEndIso={todayEndIso} offset={offset} nextOffset={assignmentPage.nextOffset} />
  </>;
}
