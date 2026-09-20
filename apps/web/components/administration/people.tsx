"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ROLE_KEYS } from "@company-human/contracts";
import type { PersonSummary } from "@company-human/database/administration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTable, Field, Input, Select, mutate } from "./controls";

export function InvitePerson({ organizationId, owner }: { organizationId: string; owner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(""); setLink("");
    try {
      const result = await mutate(`/api/organizations/${organizationId}/invitations`, "POST", { recipientEmail: data.get("email"), roleKey: data.get("role"), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
      if (!result.invitePath?.startsWith("/invite#")) throw new Error("Invitation response unavailable");
      setLink(new URL(result.invitePath, window.location.origin).toString()); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Invitation unavailable"); } finally { setBusy(false); }
  }
  return <Card className="mb-6"><CardContent><h2 className="t-title-3">Invite a person</h2><p className="mb-4 mt-2 t-body text-ink-2">Your organization sponsors their access. The invitation expires in seven days.</p>
    <form onSubmit={submit} className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end">
      <div className="flex-1"><Field label="Email"><Input name="email" type="email" required autoComplete="email" disabled={busy} /></Field></div>
      <div className="sm:w-40"><Field label="Role"><Select name="role" defaultValue="contributor" disabled={busy}>{ROLE_KEYS.filter(role => role !== "owner" && (owner || role !== "admin")).map(role => <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>)}</Select></Field></div>
      <Button type="submit" loading={busy} disabled={busy}>Create invitation</Button>
    </form>
    {error && <p role="alert" className="mt-4 t-body text-critical-text">{error}</p>}
    {link && <div role="status" className="mt-4"><p className="mb-2 t-body">Invitation created. Share this link with the recipient; no email has been sent.</p><Input aria-label="Invitation link" readOnly value={link} onFocus={e => e.currentTarget.select()} /></div>}
  </CardContent></Card>;
}

export function PeopleTable({ people, organizationId, actorUserId, owner }: { people: PersonSummary[]; organizationId: string; actorUserId: string; owner: boolean }) {
  return <AdminTable label="Organization members"><thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
    {people.map(person => <tr key={person.id}><td><p className="font-medium">{person.name}</p><p className="text-ink-3">{person.email ?? "No verified email"}</p></td>
      <td className="capitalize">{person.roleKey}</td><td className="capitalize">{person.status}</td><td>{person.userId !== actorUserId && person.roleKey !== "owner" && (owner || person.roleKey !== "admin") && person.status !== "removed"
        ? <MemberActions key={`${person.id}:${person.roleKey}:${person.status}`} person={person} organizationId={organizationId} owner={owner} /> : <span className="text-ink-3">{person.userId === actorUserId ? "You" : "—"}</span>}</td></tr>)}
    {!people.length && <tr><td colSpan={4} className="h-40 text-center text-ink-2">No people match this search.</td></tr>}
  </tbody></AdminTable>;
}
function MemberActions({ person, organizationId, owner }: { person: PersonSummary; organizationId: string; owner: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [removing, setRemoving] = useState(false); const [role, setRole] = useState(person.roleKey);
  async function change(action: string) {
    setBusy(true); setError("");
    try { await mutate(`/api/organizations/${organizationId}/memberships/${person.id}${action === "role" ? "/role" : ""}`, "PATCH", action === "role" ? { roleKey: role } : { action }); setRemoving(false); router.refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not update person"); } finally { setBusy(false); }
  }
  return <div className="min-w-56 space-y-2">
    {person.status === "active" && <div className="flex gap-2"><Select aria-label={`Role for ${person.name}`} value={role} onChange={e => setRole(e.target.value)} disabled={busy}>{ROLE_KEYS.filter(key => key !== "owner" && (owner || key !== "admin")).map(key => <option key={key} value={key}>{key}</option>)}</Select><Button variant="secondary" disabled={busy || role === person.roleKey} onClick={() => void change("role")}>Save</Button></div>}
    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => void change(person.status === "active" ? "suspend" : "reactivate")}>{person.status === "active" ? "Suspend" : "Resume"}</Button><Button variant="ghost" disabled={busy} onClick={() => setRemoving(!removing)}>Remove</Button></div>
    {removing && <div className="t-body"><p>Remove {person.name} from this organization?</p><Button disabled={busy} onClick={() => void change("remove")}>Confirm removal</Button> <Button variant="ghost" onClick={() => setRemoving(false)}>Cancel</Button></div>}
    {error && <p role="alert" className="t-caption text-critical-text">{error}</p>}
  </div>;
}
