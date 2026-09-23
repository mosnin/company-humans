"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductMembershipIdSchema } from "@company-human/contracts";
import { AdminTable } from "./controls";
import { Button } from "@/components/ui/button";
export function RequestApplicationMembers({members,organizationId,instanceId}:{members:{id:string;name:string}[];organizationId:string;instanceId:string}) {
  return <AdminTable label="Available workspace members"><thead><tr><th scope="col">Member</th><th scope="col">Application access</th></tr></thead><tbody>
    {members.map(member=><RequestRow key={member.id} member={member} organizationId={organizationId} instanceId={instanceId} />)}
    {!members.length&&<tr><td colSpan={2} className="h-40 text-center text-ink-2">No eligible members match this search.</td></tr>}
  </tbody></AdminTable>;
}
function RequestRow({member,organizationId,instanceId}:{member:{id:string;name:string};organizationId:string;instanceId:string}) {
  const router=useRouter();const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
  async function request() {
    setBusy(true);setError('');
    try {
      const response=await fetch(`/api/organizations/${organizationId}/applications/${instanceId}/members`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({membershipId:member.id})});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(typeof result?.error==='string'?result.error:'Could not request access. Please retry.');
      if(!ProductMembershipIdSchema.safeParse(result?.productMembershipId).success||result.providerAccessConfirmed!==false)throw new Error('Request could not be confirmed. Refresh this page.');
      setSaved(true);router.refresh();
    } catch(e){setError(e instanceof Error?e.message:'Could not request access. Please retry.');}finally{setBusy(false);}
  }
  return <tr><td className="break-words">{member.name}</td><td><div className="space-y-2">{saved?<p role="status" className="t-body">Request recorded. Product access is not confirmed.</p>:<Button disabled={busy} onClick={()=>void request()}>{busy?'Requesting…':'Request access'}</Button>}{error&&<p role="alert" className="t-body text-critical-text">{error}</p>}</div></td></tr>;
}
