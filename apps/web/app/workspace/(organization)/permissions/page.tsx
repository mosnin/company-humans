import { listRolePolicies } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { PermissionsEditor } from "@/components/administration/permissions";
export default async function PermissionsPage() {
  const workspace = await getWorkspace(); if (!workspace) return null; const context = workspace.context;
  if (!context.capabilities.includes("roles.manage")) return <PageHeader title="Permissions access restricted" description="Your role cannot manage organization permissions." />;
  const policies = process.env.DATABASE_SERVICE_URL ? await listRolePolicies(process.env.DATABASE_SERVICE_URL,context.userId,context.organizationId).catch(() => null) : null;
  if (!policies) return <PageHeader title="Permissions unavailable" description="We could not load role policies. Please try again." />;
  return <><PageHeader title="Permissions" description="Control what each role can see and do." /><PermissionsEditor organizationId={context.organizationId} policies={policies} actorRoleId={context.roleId} owner={context.roleKey === "owner"} heldCapabilities={context.capabilities} /></>;
}
