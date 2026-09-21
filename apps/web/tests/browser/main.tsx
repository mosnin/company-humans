import type { UsageLimitDelivery } from "@company-human/database/administration";
import { UsageLimitEditor } from "@/components/administration/usage-limits";
import { RequestApplicationMembers } from "@/components/administration/request-application-members";
import { EntitlementEditor } from "@/components/administration/entitlements";
import { ApplicationMembers } from "@/components/administration/application-members";
import { InvitationsTable } from "@/components/administration/invitations";
import { ApplicationDiagnostics } from "@/components/administration/applications";
import { OAuthSignIn } from "@/components/auth/sign-in";
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
const deliveryStatus = (['pending','running','retry_wait','succeeded','failed','superseded'] as const).find(value=>value===new URLSearchParams(location.search).get('delivery'))??'succeeded';
const delivery:UsageLimitDelivery={status:deliveryStatus,attemptCount:2,failureCode:deliveryStatus==='failed'?'provider_limit_mismatch':null,updatedAt:'2026-09-21T12:00:01Z',nextAttemptAt:deliveryStatus==='retry_wait'?'2026-09-21T12:05:00Z':null,attempts:[{number:2,startedAt:'2026-09-21T12:00:00Z',finishedAt:'2026-09-21T12:00:01Z',outcome:deliveryStatus==='succeeded'?'succeeded':'retryable_failure',failureCode:deliveryStatus==='succeeded'?null:'adapter_transport_failure'}]};
const restricted = new URLSearchParams(location.search).get("role") === "contributor";
createRoot(document.getElementById("root")!).render(<WorkspaceShell organizationName="Test organization" capabilities={ROLE_CAPABILITIES[restricted ? "contributor" : "owner"]}>
  <PageHeader title={screen.charAt(0).toUpperCase()+screen.slice(1)} description="Local component test fixture. Authentication and API responses are mocked." />
  {['usage-limits','member-usage-limits','empty-usage-limits'].includes(screen) && <UsageLimitEditor organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} data={{productName:"Scalar",membershipId:screen==='member-usage-limits'?member.id:null,memberName:screen==='member-usage-limits'?member.name:null,providerEnforcementConfirmed:false,settings:screen==='empty-usage-limits'?[]:[{meterKey:'enriched-leads',window:'utc_month',unit:screen==='member-usage-limits'?'lead':null,revision:0,maximumQuantity:null,organizationMaximumQuantity:screen==='member-usage-limits'?'0':null,memberMaximumQuantity:null,delivery:null,organizationDelivery:null,nonzeroAvailable:true},{meterKey:'retired-meter',window:'utc_day',unit:'lead',revision:2,maximumQuantity:'10',organizationMaximumQuantity:'10',memberMaximumQuantity:null,delivery:null,organizationDelivery:null,nonzeroAvailable:false}]}} />}
  {['usage-limit-delivery','member-limit-delivery'].includes(screen) && <UsageLimitEditor organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} data={{productName:'Scalar',membershipId:screen==='member-limit-delivery'?member.id:null,memberName:screen==='member-limit-delivery'?member.name:null,providerEnforcementConfirmed:false,settings:[{meterKey:'enriched-leads',window:'utc_month',unit:'lead',revision:3,maximumQuantity:'10',organizationMaximumQuantity:'0',memberMaximumQuantity:screen==='member-limit-delivery'?'10':null,nonzeroAvailable:true,delivery,organizationDelivery:{...delivery,status:'failed',failureCode:'retry_exhausted'}}]}} />}
  {(screen === "entitlements" || screen === "empty-entitlements") && <EntitlementEditor organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} data={{productName:"Scalar",membershipId:null,memberName:null,providerAccessConfirmed:false,settings:screen==='empty-entitlements'?[]:[{capability:'lead-enrichment',effect:'inherit',revision:0,organizationEffect:null,memberEffect:null,requestedEffect:'deny',allowAvailable:true},{capability:'retired-capability',effect:'deny',revision:2,organizationEffect:'deny',memberEffect:null,requestedEffect:'deny',allowAvailable:false}]}} />}
  {screen === "member-entitlements" && <EntitlementEditor organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} data={{productName:"Scalar",membershipId:member.id,memberName:member.name,providerAccessConfirmed:false,settings:[{capability:'lead-enrichment',effect:'inherit',revision:0,organizationEffect:'deny',memberEffect:null,requestedEffect:'deny',allowAvailable:true}]}} />}
  {(screen==='request-members'||screen==='empty-request-members')&&<RequestApplicationMembers organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} members={screen==='empty-request-members'?[]:[{id:member.id,name:member.name}]} />}
  {screen === "application-members" && <ApplicationMembers members={[
    {id:"queued",membershipId:member.id,memberName:"Queued Contributor",membershipStatus:"suspended",desiredEnabled:false,denial:{operation:"suspendMember",status:"queued",attemptCount:0,failureCode:null,attempts:[]}},
    {id:"failed",membershipId:member.id,memberName:"Retry Contributor",membershipStatus:"active",desiredEnabled:false,denial:{operation:"suspendMember",status:"failed",attemptCount:5,failureCode:"retry_exhausted",attempts:[{number:5,startedAt:"2026-09-21T12:00:00Z",finishedAt:"2026-09-21T12:00:01Z",outcome:"retryable_failure",failureCode:"adapter_transport_failure"}]}},
    {id:"done",membershipId:member.id,memberName:"Removed Contributor",membershipStatus:"removed",desiredEnabled:false,denial:{operation:"removeMember",status:"succeeded",attemptCount:1,failureCode:null,attempts:[]}},
  ]} />}
  {screen === "empty-application-members" && <ApplicationMembers members={[]} />}
  {screen === "invitations" && <InvitationsTable organizationId={org} owner invitations={[{id:`ch_inv_${"b".repeat(32)}`,email:"pending@example.test",roleKey:"contributor",status:"pending",expiresAt:"2026-10-01T12:00:00Z"}]} />}
  {screen === "applications" && <ApplicationDiagnostics organizationId={org} applications={[{ id: "fixture-app", productName: "Scalar", instanceKey: "primary", mode: "provisioned", desiredEnabled: true, provisioningStatus: "pending", operation: { status: "failed", attemptCount: 1, failureCode: "authentication_required", nextAttemptAt: "2026-09-21T12:00:00Z", attempts: [{ number: 1, startedAt: "2026-09-21T12:00:00Z", finishedAt: "2026-09-21T12:00:01Z", outcome: "permanent_failure", failureCode: "authentication_required" }] } }]} />}
  {screen === "empty-applications" && <ApplicationDiagnostics organizationId={org} applications={[]} />}
  {screen === "oauth" && <OAuthSignIn returnToInvite providers={["google", "github"]} />}
  {screen === "invite" && <AcceptInvitationPage />}
  {screen === "people" && <><InvitePerson organizationId={org} owner /><PeopleTable organizationId={org} actorUserId={owner} owner people={[member]} /></>}
  {screen === "teams" && <TeamsEditor organizationId={org} canCreate canAssign people={[member]} teams={[{ id: `ch_team_${"a".repeat(32)}`, name: "Sales", memberCount: 0, members: [] }]} />}
  {screen === "permissions" && <PermissionsEditor organizationId={org} actorRoleId={`ch_role_${"a".repeat(32)}`} owner heldCapabilities={ROLE_CAPABILITIES.owner} policies={[{ id: `ch_role_${"b".repeat(32)}`, key: "contributor", capabilities: [...ROLE_CAPABILITIES.contributor] }]} />}
</WorkspaceShell>);
