import AcceptInvitationPage from "@/app/invite/page";
import { createRoot } from "react-dom/client";
import { ROLE_CAPABILITIES } from "@company-human/contracts";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { PageHeader } from "@/components/ui/page-header";
import { InvitePerson, PeopleTable } from "@/components/administration/people";
import { TeamsEditor } from "@/components/administration/teams";
import { PermissionsEditor } from "@/components/administration/permissions";
import "@/app/globals.css";
const org = `ch_org_${"a".repeat(32)}`;
const owner = `ch_usr_${"a".repeat(32)}`;
const member = { id: `ch_mem_${"b".repeat(32)}`, userId: `ch_usr_${"b".repeat(32)}`, name: "Test Contributor", email: "contributor@example.test", roleKey: "contributor", status: "active" };
const screen = new URLSearchParams(location.search).get("screen") ?? "people";
const restricted = new URLSearchParams(location.search).get("role") === "contributor";
createRoot(document.getElementById("root")!).render(<WorkspaceShell organizationName="Test organization" capabilities={ROLE_CAPABILITIES[restricted ? "contributor" : "owner"]}>
  <PageHeader title={screen.charAt(0).toUpperCase()+screen.slice(1)} description="Local component test fixture. Authentication and API responses are mocked." />
  {screen === "invite" && <AcceptInvitationPage />}
  {screen === "people" && <><InvitePerson organizationId={org} owner /><PeopleTable organizationId={org} actorUserId={owner} owner people={[member]} /></>}
  {screen === "teams" && <TeamsEditor organizationId={org} canCreate canAssign people={[member]} teams={[{ id: `ch_team_${"a".repeat(32)}`, name: "Sales", memberCount: 0, members: [] }]} />}
  {screen === "permissions" && <PermissionsEditor organizationId={org} actorRoleId={`ch_role_${"a".repeat(32)}`} owner heldCapabilities={ROLE_CAPABILITIES.owner} policies={[{ id: `ch_role_${"b".repeat(32)}`, key: "contributor", capabilities: [...ROLE_CAPABILITIES.contributor] }]} />}
</WorkspaceShell>);
