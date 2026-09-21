"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InvitationSummary } from "@company-human/database/administration";
import { Button } from "@/components/ui/button";
import { AdminTable, mutate } from "./controls";
export function InvitationsTable({ invitations, organizationId, owner }: { invitations: InvitationSummary[]; organizationId: string; owner: boolean }) {
  const [revokedIds,setRevokedIds] = useState<string[]>([]);
  return <AdminTable label="Organization invitations"><thead><tr><th scope="col">Recipient</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Expires</th><th scope="col">Actions</th></tr></thead><tbody>
    {invitations.map(invitation => <tr key={invitation.id}><td>{invitation.email}</td><td className="capitalize">{invitation.roleKey}</td><td className="capitalize">{revokedIds.includes(invitation.id) ? "revoked" : invitation.status}</td><td>{new Date(invitation.expiresAt).toISOString().slice(0,10)} UTC</td><td>{invitation.status === "pending" && (owner || invitation.roleKey !== "admin") ? <RevokeInvitation invitation={invitation} organizationId={organizationId} onRevoked={() => setRevokedIds(ids => [...ids,invitation.id])} /> : "—"}</td></tr>)}
    {!invitations.length && <tr><td colSpan={5} className="h-40 text-center text-ink-2">No invitations yet.</td></tr>}
  </tbody></AdminTable>;
}
function RevokeInvitation({ invitation, organizationId, onRevoked }: { invitation: InvitationSummary; organizationId: string; onRevoked: () => void }) {
  const router = useRouter(); const [confirming,setConfirming] = useState(false); const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [revoked,setRevoked] = useState(false);
  async function revoke() {
    setBusy(true); setError("");
    try { await mutate(`/api/organizations/${organizationId}/invitations/${invitation.id}`,"DELETE",{}); setRevoked(true); onRevoked(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not revoke invitation"); } finally { setBusy(false); }
  }
  if (revoked) return <span role="status">Invitation revoked.</span>;
  return <div className="min-w-48 space-y-2">{confirming ? <><p>Revoke the invitation for {invitation.email}?</p><Button disabled={busy} onClick={() => void revoke()}>Confirm revocation</Button> <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button></> : <Button variant="secondary" onClick={() => setConfirming(true)}>Revoke invitation</Button>}{error && <p role="alert" className="text-critical-text">{error}</p>}</div>;
}
