import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getWorkspace } from "@/lib/workspace";
import { readWorkspaceModules } from "@company-human/database/workspace-modules";
export const dynamic = "force-dynamic";

export default async function OrganizationLayout({ children }: { children: ReactNode }) {
  const workspace = await getWorkspace();
  if (!workspace) return <main className="min-h-screen bg-canvas p-8"><PageHeader title="Workspace unavailable" description="We could not check your organization access. Please try again shortly." /></main>;
  const modules = process.env.DATABASE_RUNTIME_URL
    ? await readWorkspaceModules(process.env.DATABASE_RUNTIME_URL, { actorUserId: workspace.context.userId, organizationId: workspace.context.organizationId }).catch(() => null)
    : null;
  const workEnabled = modules?.find(setting => setting.moduleKey === "work")?.enabled === true;
  return <WorkspaceShell organizationName={workspace.organization.name} capabilities={workspace.context.capabilities} workEnabled={workEnabled}>{children}</WorkspaceShell>;
}
