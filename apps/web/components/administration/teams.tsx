"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PersonSummary, TeamSummary } from "@company-human/database/administration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, mutate } from "./controls";
export function TeamsEditor({ organizationId, teams, people, canCreate, canAssign }: { organizationId: string; teams: TeamSummary[]; people: PersonSummary[]; canCreate: boolean; canAssign: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, mode: "create" | "assign") {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "create") await mutate(`/api/organizations/${organizationId}/teams`, "POST", { name: data.get("name") });
      else await mutate(`/api/organizations/${organizationId}/teams/${data.get("teamId")}/members`, "PUT", { membershipId: data.get("membershipId"), teamRole: data.get("teamRole") });
      form.reset(); setMessage(mode === "create" ? "Team created." : "Team assignment saved."); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update teams"); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    {canCreate && <Card><CardContent><h2 className="mb-4 t-title-3">Create a team</h2><form onSubmit={event => void submit(event,"create")} className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Team name"><Input name="name" required maxLength={128} disabled={busy} /></Field></div><Button type="submit" disabled={busy}>Create team</Button></form></CardContent></Card>}
    {canAssign && teams.length > 0 && people.length > 0 && <Card><CardContent><h2 className="mb-4 t-title-3">Assign a person</h2><form onSubmit={event => void submit(event,"assign")} className="grid gap-4 sm:grid-cols-2">
      <Field label="Team"><Select name="teamId" disabled={busy}>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></Field>
      <Field label="Person"><Select name="membershipId" disabled={busy}>{people.filter(person => person.status === "active").map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></Field>
      <Field label="Team responsibility"><Select name="teamRole" disabled={busy}><option value="member">Member</option><option value="manager">Manager</option></Select></Field><div className="self-end"><Button type="submit" disabled={busy}>Save assignment</Button></div>
    </form></CardContent></Card>}
    {error && <p role="alert" className="t-body text-critical-text">{error}</p>}{message && <p role="status" className="t-body">{message}</p>}
    {!teams.length && <Card><CardContent><h2 className="t-title-3">No teams yet</h2><p className="mt-2 t-body text-ink-2">Create a team to group people and assign a manager.</p></CardContent></Card>}
    {teams.map(team => <Card key={team.id}><CardContent><h2 className="t-title-3">{team.name}</h2><p className="mt-2 t-body text-ink-3">{team.memberCount} active {team.memberCount === 1 ? "member" : "members"}</p><ul className="mt-4 divide-y divide-hairline">{team.members.map((member,index) => <li key={index} className="flex justify-between gap-4 py-2 t-body"><span>{member.name}</span><span className="capitalize text-ink-3">{member.role}</span></li>)}</ul></CardContent></Card>)}
  </div>;
}
