import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getWorkspace } from "@/lib/workspace";
export const dynamic = "force-dynamic";

export default async function OrganizationLayout({ children }: { children: ReactNode }) {
  const workspace = await getWorkspace();
  if (!workspace) return <main className="min-h-screen bg-canvas p-8"><PageHeader title="Workspace unavailable" description="We could not check your organization access. Please try again shortly." /></main>;
  return <WorkspaceShell organizationName={workspace.organization.name} capabilities={workspace.context.capabilities}>{children}</WorkspaceShell>;
}
