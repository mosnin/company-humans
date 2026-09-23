"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CAPABILITIES, type Capability } from "@company-human/contracts";
import type { RolePolicy } from "@company-human/database/administration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Select, mutate } from "./controls";
const labels: Record<Capability,string> = {
  "organization.manage":"Manage organization settings", "roles.manage":"Manage permissions", "members.manage":"Manage people",
  "teams.create":"Create teams", "teams.manage.assigned":"Manage assigned teams", "teams.manage.all":"Manage all teams",
  "applications.manage":"Manage applications", "budgets.manage":"Manage budgets",
  "assignments.read.own":"View own work", "assignments.read.team":"View team work", "assignments.read.all":"View all work",
  "assignments.manage.team":"Manage team work", "assignments.manage.all":"Manage all work",
  "crm.read.own":"View own CRM records", "crm.read.team":"View team CRM records", "crm.read.all":"View all CRM records",
  "crm.write.own":"Edit own CRM records", "crm.write.team":"Edit team CRM records", "crm.write.all":"Edit all CRM records",
  "earnings.read.own":"View own earnings", "payouts.read.all":"View all payouts", "billing.read.all":"View organization billing",
  "usage.read.own":"View own usage", "usage.read.team":"View team usage", "usage.read.all":"View all usage",
  "context.read.approved":"Read approved company context", "context.policy.manage":"Manage context access",
  "integrations.manage":"Manage integrations", "audit.read.all":"Read organization audit history", "product.use":"Use enabled applications",
};
export function PermissionsEditor({ policies, organizationId, actorRoleId, owner, heldCapabilities }: { policies: RolePolicy[]; organizationId: string; actorRoleId: string; owner: boolean; heldCapabilities: readonly Capability[] }) {
  const [selected, setSelected] = useState(policies.find(policy => policy.key === "contributor")?.id ?? policies[0]?.id ?? "");
  const policy = policies.find(item => item.id === selected);
  return <><div className="mb-6 max-w-sm"><Field label="Role"><Select value={selected} onChange={event => setSelected(event.target.value)}>{policies.map(role => <option key={role.id} value={role.id}>{role.key.charAt(0).toUpperCase()+role.key.slice(1)}</option>)}</Select></Field></div>
    {policy && <PolicyForm key={policy.id+policy.capabilities.join(",")} policy={policy} organizationId={organizationId} heldCapabilities={heldCapabilities} editable={policy.key !== "owner" && policy.id !== actorRoleId && (owner || policy.key !== "admin")} />}
  </>;
}
function PolicyForm({ policy, organizationId, heldCapabilities, editable }: { policy: RolePolicy; organizationId: string; heldCapabilities: readonly Capability[]; editable: boolean }) {
  const router = useRouter(); const [grants,setGrants] = useState<Capability[]>(policy.capabilities); const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [saved,setSaved] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();setBusy(true);setError("");setSaved(false);
    try { await mutate(`/api/organizations/${organizationId}/roles/${policy.id}/permissions`, "PUT", { capabilities: grants, expectedCapabilities: policy.capabilities });setSaved(true);router.refresh(); }
    catch(e) {setError(e instanceof Error ? e.message : "Could not save permissions");} finally {setBusy(false);}
  }
  return <Card><CardContent><h2 className="t-title-3 capitalize">{policy.key} permissions</h2><p className="mt-2 mb-6 t-body text-ink-2">{editable ? "Changes apply to everyone with this role. Every change is recorded in the audit history." : "This policy is protected. You cannot change the owner policy or your own role."}</p>
    <form onSubmit={submit}><fieldset disabled={!editable || busy} className="grid gap-4 sm:grid-cols-2"><legend className="sr-only">Allowed actions</legend>{CAPABILITIES.map(capability => <label key={capability} className="flex items-start gap-3 t-body"><input className="focus-ring mt-0.5 size-4 accent-[var(--action-fill)]" type="checkbox" checked={grants.includes(capability)} disabled={!heldCapabilities.includes(capability)} onChange={event => {setSaved(false);setGrants(event.target.checked ? [...grants,capability] : grants.filter(item => item !== capability));}} /><span>{labels[capability]}</span></label>)}</fieldset>
      {error && <p role="alert" className="mt-5 t-body text-critical-text">{error}</p>}{saved && <p role="status" className="mt-5 t-body">Permissions saved.</p>}
      {editable && <Button className="mt-6" type="submit" loading={busy} disabled={busy}>Save permissions</Button>}
    </form></CardContent></Card>;
}
