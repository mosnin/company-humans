import { readWorkspaceModules } from "@company-human/database/workspace-modules";
import { WorkspaceModuleControls } from "@/components/administration/workspace-module-controls";
import { PageHeader } from "@/components/ui/page-header";
import { getWorkspace } from "@/lib/workspace";

export default async function ModulesPage() {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const { context } = workspace;
  if (!context.capabilities.includes("organization.manage"))
    return <PageHeader title="Workspace settings restricted" description="Your role cannot configure workspace modules." />;
  const runtimeUrl = process.env.DATABASE_RUNTIME_URL;
  if (!runtimeUrl) return <PageHeader title="Workspace settings unavailable" description="We could not load module settings. Try again shortly." />;
  const settings = await readWorkspaceModules(runtimeUrl, {
    actorUserId: context.userId, organizationId: context.organizationId,
  }).catch(() => null);
  if (!settings) return <PageHeader title="Workspace settings unavailable" description="We could not load module settings. Try again shortly." />;
  return <><PageHeader title="Workspace modules" description="Choose which native parts of Company Human appear in this workspace. Connected applications are managed separately." />
    <WorkspaceModuleControls organizationId={context.organizationId} settings={settings} />
  </>;
}
