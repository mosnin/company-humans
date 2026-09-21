"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EntitlementRevisionV1Schema, requestedEntitlementEffect } from "@company-human/contracts";
import type { readApplicationEntitlements } from "@company-human/database/administration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Select } from "./controls";
type Data = Awaited<ReturnType<typeof readApplicationEntitlements>>;
type Setting = Data['settings'][number];
export function EntitlementEditor({data,organizationId,instanceId}:{data:Data;organizationId:string;instanceId:string}) {
  return <div className="space-y-4"><p className="t-body text-ink-2">{data.membershipId ? `Overrides for ${data.memberName}. An organization deny always takes precedence.` : 'Defaults apply to members of this workspace. Member overrides can further restrict access.'} Saved settings do not confirm access in the connected application.</p>
    {!data.settings.length && <Card><CardContent><h2 className="t-title-3">No capabilities available</h2><p className="t-body text-ink-2">This application has not published configurable capabilities yet.</p></CardContent></Card>}
    {data.settings.map(setting=><SettingForm key={`${data.membershipId}:${setting.capability}:${setting.revision}`} setting={setting} organizationId={organizationId} instanceId={instanceId} membershipId={data.membershipId} />)}
  </div>;
}
function SettingForm({setting,organizationId,instanceId,membershipId}:{setting:Setting;organizationId:string;instanceId:string;membershipId:string|null}) {
  const router=useRouter();
  const [effect,setEffect]=useState(setting.effect),[savedEffect,setSavedEffect]=useState(setting.effect),[revision,setRevision]=useState(setting.revision);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[conflict,setConflict]=useState(false);
  const requested=requestedEntitlementEffect(membershipId===null?savedEffect:setting.organizationEffect,membershipId===null?null:savedEffect);
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');setSaved(false);
    try {
      const response=await fetch(`/api/organizations/${organizationId}/applications/${instanceId}/entitlements`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({membershipId,capability:setting.capability,effect,expectedRevision:revision})});
      const result=await response.json().catch(()=>null);
      if(response.status===409)setConflict(true);
      if(!response.ok)throw new Error(typeof result?.error==='string'?result.error:'Could not save settings. Please retry.');
      const parsed=EntitlementRevisionV1Schema.safeParse(result?.revision);
      if(!parsed.success)throw new Error('Save could not be confirmed. Reload settings.');
      const receipt=parsed.data;
      if(receipt.organizationId!==organizationId||receipt.productInstanceId!==instanceId||receipt.membershipId!==membershipId||receipt.capability!==setting.capability||receipt.revision!==revision+1||receipt.effect!==effect||result.providerAccessConfirmed!==false)throw new Error('Save could not be confirmed. Reload settings.');
      setRevision(receipt.revision);setSavedEffect(receipt.effect);setSaved(true);router.refresh();
    } catch(e){setError(e instanceof Error?e.message:'Could not save settings. Please retry.');}finally{setBusy(false);}
  }
  return <Card><CardContent><h2 className="t-title-3 break-all">{setting.capability}</h2>
    <p className="mt-2 t-body text-ink-2">Saved request: {requested==='allow'?'Allow':'Deny'} · Revision {revision}</p>
    {membershipId!==null&&<p className="t-caption text-ink-3">Organization default: {setting.organizationEffect??'Not configured'}</p>}
    {!setting.allowAvailable&&<p className="mt-2 t-body text-ink-2">Allow is unavailable for this capability. You can deny access or clear this setting.</p>}
    <form onSubmit={submit} className="mt-4 space-y-4"><div className="max-w-sm"><Field label={`Setting for ${setting.capability}`}><Select value={effect} disabled={busy||conflict} onChange={event=>{setEffect(event.target.value as Setting['effect']);setSaved(false);}}>
      <option value="inherit">{membershipId?'Use organization default':'No default allow'}</option><option value="allow" disabled={!setting.allowAvailable}>Allow</option><option value="deny">Deny</option>
    </Select></Field></div>
    <Button type="submit" disabled={busy||conflict||effect===savedEffect||(!setting.allowAvailable&&effect==='allow')}>{busy?'Saving…':'Save setting'}</Button>
    {conflict&&<Button type="button" variant="secondary" className="ml-2" onClick={()=>window.location.reload()}>Reload settings</Button>}
    {error&&<p role="alert" className="t-body text-critical-text">{error}</p>}
    {saved&&<p role="status" className="t-body">Setting saved. Product access is not confirmed.</p>}
    </form></CardContent></Card>;
}
