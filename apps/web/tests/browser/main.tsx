import { UsageView } from "@/components/usage/usage-view";
import { ApplicationHealth } from "@/components/administration/application-health";
import { ApplicationCatalog } from "@/components/administration/application-catalog";
import type { UsageLimitDelivery } from "@company-human/database/administration";
import { UsageLimitEditor } from "@/components/administration/usage-limits";
import { RequestApplicationMembers } from "@/components/administration/request-application-members";
import { EntitlementEditor } from "@/components/administration/entitlements";
import { ApplicationMembers } from "@/components/administration/application-members";
import { MemberActivationReadiness } from "@/components/administration/member-activation-readiness";
import { InvitationsTable } from "@/components/administration/invitations";
import { ApplicationDiagnostics } from "@/components/administration/applications";
import { OAuthSignIn } from "@/components/auth/sign-in";
import AcceptInvitationPage from "@/app/invite/page";
import { createRoot } from "react-dom/client";
import { ROLE_CAPABILITIES } from "@company-human/contracts";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { WorkBoard } from "@/components/work/work-board";
import { WorkspaceModuleControls } from "@/components/administration/workspace-module-controls";
import { HomeOverview } from "@/components/home/home-overview";
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
createRoot(document.getElementById("root")!).render(<WorkspaceShell organizationName="Test organization" capabilities={ROLE_CAPABILITIES[restricted ? "contributor" : "owner"]} workEnabled={screen.startsWith("work")}>
  <PageHeader title={screen.startsWith('work') ? 'Work' : screen === 'activation-readiness' ? 'Member activation readiness' : screen.charAt(0).toUpperCase()+screen.slice(1)} description="Local component test fixture. Authentication and API responses are mocked." />
  {screen.startsWith('usage-view') && (screen === 'usage-view-permission' ? <UsageView permitted={false}/> : <UsageView permitted scope="Your own usage only." selection={{environment:'production',from:'2026-09-01',through:'2026-09-30'}} validQuery={screen !== 'usage-view-invalid'} usage={screen === 'usage-view-error' ? null : screen === 'usage-view-empty' ? [] : [
    {organizationId:org, productId:'fixture-scalar', productName:'Scalar', productInstanceId:null,membershipId:null,teamId:null,capabilityKey:null,environment:'production',meterKey:'enrichment',meterName:'Enrichment credits',meterVersion:1,unit:'credits',aggregation:'sum',quantity:'999999999999999999.123456',eventCount:'25'},
    {organizationId:org, productId:'fixture-stored', productName:'Stored', productInstanceId:null,membershipId:null,teamId:null,capabilityKey:null,environment:'production',meterKey:'memory',meterName:'Memory storage',meterVersion:2,unit:'bytes',aggregation:'last',quantity:'0.100001',eventCount:'2'},
  ]}/>)}
  {['usage-limits','member-usage-limits','empty-usage-limits'].includes(screen) && <UsageLimitEditor organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} data={{productName:"Scalar",membershipId:screen==='member-usage-limits'?member.id:null,memberName:screen==='member-usage-limits'?member.name:null,providerEnforcementConfirmed:false,settings:screen==='empty-usage-limits'?[]:[{meterKey:'enriched-leads',window:'utc_month',unit:screen==='member-usage-limits'?'lead':null,revision:0,maximumQuantity:null,organizationMaximumQuantity:screen==='member-usage-limits'?'0':null,memberMaximumQuantity:null,delivery:null,organizationDelivery:null,nonzeroAvailable:true},{meterKey:'retired-meter',window:'utc_day',unit:'lead',revision:2,maximumQuantity:'10',organizationMaximumQuantity:'10',memberMaximumQuantity:null,delivery:null,organizationDelivery:null,nonzeroAvailable:false}]}} />}
  {['usage-limit-delivery','member-limit-delivery'].includes(screen) && <UsageLimitEditor organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} data={{productName:'Scalar',membershipId:screen==='member-limit-delivery'?member.id:null,memberName:screen==='member-limit-delivery'?member.name:null,providerEnforcementConfirmed:false,settings:[{meterKey:'enriched-leads',window:'utc_month',unit:'lead',revision:3,maximumQuantity:'10',organizationMaximumQuantity:'0',memberMaximumQuantity:screen==='member-limit-delivery'?'10':null,nonzeroAvailable:true,delivery,organizationDelivery:{...delivery,status:'failed',failureCode:'retry_exhausted'}}]}} />}
  {(screen === "entitlements" || screen === "empty-entitlements") && <EntitlementEditor organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} data={{productName:"Scalar",membershipId:null,memberName:null,providerAccessConfirmed:false,staging:null,settings:screen==='empty-entitlements'?[]:[{capability:'lead-enrichment',effect:'inherit',revision:0,organizationEffect:null,memberEffect:null,requestedEffect:'deny',allowAvailable:true},{capability:'retired-capability',effect:'deny',revision:2,organizationEffect:'deny',memberEffect:null,requestedEffect:'deny',allowAvailable:false}]}} />}
  {(screen === "member-entitlements" || screen === "capability-delivery" || screen === "stale-capabilities") && <EntitlementEditor organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} data={{productName:"Scalar",membershipId:member.id,memberName:member.name,providerAccessConfirmed:false,staging:screen==='member-entitlements'?null:{policyRevision:3,matchesCurrentRequest:screen!=='stale-capabilities',recordedAt:'2026-09-21T12:00:00Z',delivery:{status:'succeeded',attemptCount:2,failureCode:null,updatedAt:'2026-09-21T12:05:00Z',nextAttemptAt:null,attempts:[{number:1,startedAt:'2026-09-21T12:00:00Z',finishedAt:'2026-09-21T12:00:02Z',outcome:'retryable_failure',failureCode:'adapter_transport_failure'},{number:2,startedAt:'2026-09-21T12:05:00Z',finishedAt:'2026-09-21T12:05:02Z',outcome:'succeeded',failureCode:null}]}},settings:[{capability:'lead-enrichment',effect:'inherit',revision:0,organizationEffect:'deny',memberEffect:null,requestedEffect:'deny',allowAvailable:true}]}} />}
  {(screen==='request-members'||screen==='empty-request-members')&&<RequestApplicationMembers organizationId={org} instanceId={`ch_inst_${"a".repeat(32)}`} members={screen==='empty-request-members'?[]:[{id:member.id,name:member.name}]} />}
  {screen === "application-members" && <ApplicationMembers members={[
    {id:"queued",membershipId:member.id,memberName:"Queued Contributor",membershipStatus:"suspended",desiredEnabled:false,denial:{operation:"suspendMember",status:"queued",attemptCount:0,failureCode:null,attempts:[]}},
    {id:"failed",membershipId:member.id,memberName:"Retry Contributor",membershipStatus:"active",desiredEnabled:false,denial:{operation:"suspendMember",status:"failed",attemptCount:5,failureCode:"retry_exhausted",attempts:[{number:5,startedAt:"2026-09-21T12:00:00Z",finishedAt:"2026-09-21T12:00:01Z",outcome:"retryable_failure",failureCode:"adapter_transport_failure"}]}},
    {id:"done",membershipId:member.id,memberName:"Removed Contributor",membershipStatus:"removed",desiredEnabled:false,denial:{operation:"removeMember",status:"succeeded",attemptCount:1,failureCode:null,attempts:[]}},
  ]} />}
  {screen === "empty-application-members" && <ApplicationMembers members={[]} />}
  {screen === "activation-readiness" && <MemberActivationReadiness diagnostic={{
    ready: false, subject: {membershipId: member.id, productInstanceId: `ch_inst_${"a".repeat(32)}`},
    reasons: ["capability_readback_missing", "limit_readback_missing", "meter_semantics_unverified"],
    evidence: {capabilityRevision: 3, checkedLimitCount: 2, declaredMeterCount: 1},
  }} />}
  {screen === "invitations" && <InvitationsTable organizationId={org} owner invitations={[{id:`ch_inv_${"b".repeat(32)}`,email:"pending@example.test",roleKey:"contributor",status:"pending",expiresAt:"2026-10-01T12:00:00Z"}]} />}
  {screen === "applications" && <ApplicationDiagnostics organizationId={org} applications={[{ id: "fixture-app", productName: "Scalar", instanceKey: "primary", mode: "provisioned", desiredEnabled: true, provisioningStatus: "pending", operation: { status: "failed", attemptCount: 1, failureCode: "authentication_required", nextAttemptAt: "2026-09-21T12:00:00Z", attempts: [{ number: 1, startedAt: "2026-09-21T12:00:00Z", finishedAt: "2026-09-21T12:00:01Z", outcome: "permanent_failure", failureCode: "authentication_required" }] } }]} />}
  {screen === "connect-application" && <ApplicationDiagnostics organizationId={org} applications={[{id:`ch_inst_${"a".repeat(32)}`,productName:"Scalar",instanceKey:"primary",mode:"connected",desiredEnabled:true,provisioningStatus:"pending",operation:null}]} />}
  {screen === "application-catalog" && <ApplicationCatalog organizationId={org} products={[{id:`ch_prod_${"a".repeat(32)}`,name:"Scalar",description:"Outbound and enrichment",ready:true,modes:["provisioned","connected"],capabilities:["lead-enrichment"],usageMeters:["enriched-leads"],requiredPermissions:["product.use"],connectionRequirements:["service-credential"],billingBehavior:"organization_sponsored"},{id:`ch_prod_${"b".repeat(32)}`,name:"Stored",description:null,ready:false,modes:[],capabilities:[],usageMeters:[],requiredPermissions:[],connectionRequirements:[],billingBehavior:null}]} />}
  {screen.startsWith("health-") && <ApplicationHealth health={screen === "health-empty" ? null : {startedAt:"2026-09-21T12:00:00Z",recordedAt:"2026-09-21T12:00:02Z",failureCode:screen === "health-failed" ? "adapter_transport_failure" : screen === "health-reauth" ? "authentication_required" : null,assessment:["health-failed","health-reauth"].includes(screen)?null:{state:screen === "health-stale" ? "stale" : "current",observation:{status:screen === "health-degraded" ? "degraded" : "healthy",checkedAt:"2026-09-21T12:00:00Z",lastSuccessfulSyncAt:"2026-09-21T11:59:00Z",lastFailureAt:null,affectedMembers:0}}}}/>}
  {screen === "empty-applications" && <ApplicationDiagnostics organizationId={org} applications={[]} />}
  {screen === "oauth" && <OAuthSignIn returnToInvite providers={["google", "email"]} />}
  {screen === "invite" && <AcceptInvitationPage />}
  {screen === "people" && <><InvitePerson organizationId={org} owner /><PeopleTable organizationId={org} actorUserId={owner} owner people={[member]} /></>}
  {screen === "teams" && <TeamsEditor organizationId={org} canCreate canAssign people={[member]} teams={[{ id: `ch_team_${"a".repeat(32)}`, name: "Sales", memberCount: 0, members: [] }]} />}
  {screen === "permissions" && <PermissionsEditor organizationId={org} actorRoleId={`ch_role_${"a".repeat(32)}`} owner heldCapabilities={ROLE_CAPABILITIES.owner} policies={[{ id: `ch_role_${"b".repeat(32)}`, key: "contributor", capabilities: [...ROLE_CAPABILITIES.contributor] }]} />}
  {screen === "work-own" && <WorkBoard organizationId={org} view="mine" canManage={false} candidates={[]} todayEndIso="2026-09-23T23:59:59.999Z" offset={0} nextOffset={null} items={[{id:`ch_hwrk_${"a".repeat(32)}`,title:"Call the lead",objective:"Confirm the team's needs",dueAt:"2026-09-23T15:00:00.000Z",priority:"high",expectedOutcome:"A qualified conversation",evidenceRequired:true,assigneeDisplayName:"You",completion:null}]} />}
  {screen === "work-team" && <WorkBoard organizationId={org} view="team" canManage todayEndIso="2026-09-23T23:59:59.999Z" offset={0} nextOffset={null} candidates={[{membershipId:member.id,displayName:member.name,teamId:`ch_team_${"a".repeat(32)}`,teamName:"Sales"}]} items={[{id:`ch_hwrk_${"b".repeat(32)}`,title:"Call the lead",objective:"Confirm the team's needs",dueAt:"2026-09-23T15:00:00.000Z",priority:"high",expectedOutcome:"A qualified conversation",evidenceRequired:true,assigneeDisplayName:member.name,completion:{outcome:"Asked for a proposal",evidence:"Call notes",completedAt:"2026-09-23T16:00:00.000Z"}}]} />}
  {screen === "modules" && <WorkspaceModuleControls organizationId={org} settings={[
    {moduleKey:"work",enabled:true,revision:0},{moduleKey:"crm",enabled:false,revision:0},
    {moduleKey:"referrals",enabled:false,revision:0},{moduleKey:"earnings",enabled:false,revision:0},
    {moduleKey:"leaderboard",enabled:false,revision:0},{moduleKey:"team",enabled:false,revision:0},
    {moduleKey:"context",enabled:false,revision:0},{moduleKey:"creator",enabled:false,revision:0},
  ]} />}
  {screen === "home" && <HomeOverview admin={false} canReadUsage workState="ready" appRecordCount={1} actions={[
    {id:`ch_hwrk_${"a".repeat(32)}`,title:"Call the lead",dueAt:"2026-09-23T15:00:00.000Z"},
    {id:`ch_hwrk_${"b".repeat(32)}`,title:"Review the proposal",dueAt:null},
  ]} />}
</WorkspaceShell>);
