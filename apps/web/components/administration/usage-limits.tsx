"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LimitQuantitySchema, ProductCapabilityKeySchema, UsageLimitRevisionV1Schema } from "@company-human/contracts";
import type { readApplicationUsageLimits, UsageLimitDelivery } from "@company-human/database/administration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "./controls";
type Data = Awaited<ReturnType<typeof readApplicationUsageLimits>>;
type Setting = Data["settings"][number];
const windows = { utc_day: "Daily", utc_week: "Weekly", utc_month: "Monthly" };
export function UsageLimitEditor({ data, organizationId, instanceId }: { data: Data; organizationId: string; instanceId: string }) {
  const router = useRouter();
  const [units, setUnits] = useState<Record<string, string>>({});
  return <div className="space-y-4"><p className="t-body text-ink-2">{data.membershipId ? `Limits for ${data.memberName}. Organization limits still apply.` : "Limits for this organization’s application usage."} Zero requests a stop. An unconfigured limit does not authorize unlimited usage. Saving does not confirm enforcement in the application.</p>
    <p className="t-caption text-ink-3">Windows use UTC: calendar days, weeks starting Monday, and calendar months.</p>
    <Button type="button" variant="secondary" onClick={() => router.refresh()}>Refresh delivery status</Button>
    {!data.settings.length && <Card><CardContent><h2 className="t-title-3">No usage meters available</h2><p className="t-body text-ink-2">This application has not published configurable usage meters yet.</p></CardContent></Card>}
    {data.settings.map(setting => <LimitForm key={`${data.membershipId}:${setting.meterKey}:${setting.window}:${setting.revision}`} setting={setting}
      organizationId={organizationId} instanceId={instanceId} membershipId={data.membershipId} knownUnit={setting.unit ?? units[setting.meterKey] ?? null}
      onUnit={unit => setUnits(previous => ({ ...previous, [setting.meterKey]: unit }))} />)}
  </div>;
}
function LimitForm({ setting, organizationId, instanceId, membershipId, knownUnit, onUnit }: {
  setting: Setting; organizationId: string; instanceId: string; membershipId: string | null; knownUnit: string | null; onUnit: (unit: string) => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(setting.maximumQuantity ?? ""), [unit, setUnit] = useState(knownUnit ?? "");
  const [savedQuantity, setSavedQuantity] = useState(setting.maximumQuantity), [revision, setRevision] = useState(setting.revision);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), [conflict, setConflict] = useState(false);
  const selectedUnit = knownUnit ?? unit, parsedQuantity = LimitQuantitySchema.safeParse(quantity), parsedUnit = ProductCapabilityKeySchema.safeParse(selectedUnit);
  const available = setting.nonzeroAvailable || (revision > 0 && parsedQuantity.success && parsedQuantity.data === "0");
  const valid = parsedQuantity.success && parsedUnit.success;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!valid || !available || busy || conflict) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/applications/${instanceId}/usage-limits`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ membershipId, meterKey: setting.meterKey, unit: selectedUnit, window: setting.window, maximumQuantity: parsedQuantity.data, expectedRevision: revision }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 409) setConflict(true);
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Could not save the limit. Please retry.");
      const receipt = UsageLimitRevisionV1Schema.safeParse(result?.revision);
      if (!receipt.success || receipt.data.organizationId !== organizationId || receipt.data.productInstanceId !== instanceId || receipt.data.membershipId !== membershipId ||
        receipt.data.meterKey !== setting.meterKey || receipt.data.window !== setting.window || receipt.data.unit !== selectedUnit || receipt.data.maximumQuantity !== parsedQuantity.data ||
        receipt.data.revision !== revision + 1 || result.providerEnforcementConfirmed !== false) {
        setConflict(true); throw new Error("Save could not be confirmed. Reload settings.");
      }
      setRevision(receipt.data.revision); setQuantity(receipt.data.maximumQuantity); setSavedQuantity(receipt.data.maximumQuantity); onUnit(receipt.data.unit); setSaved(true); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the limit. Please retry."); } finally { setBusy(false); }
  }
  const title = `${setting.meterKey} · ${windows[setting.window]}`;
  return <Card><CardContent><h2 className="t-title-3 break-all">{title}</h2>
    <p className="mt-2 t-body text-ink-2">Saved limit: {savedQuantity === null ? "Not configured" : `${savedQuantity} ${selectedUnit}`} · Revision {revision}</p>
    <LimitDelivery delivery={revision===setting.revision?setting.delivery:null} configured={revision>0} label="Delivery" />
    {membershipId && <LimitDelivery delivery={setting.organizationDelivery} configured={setting.organizationMaximumQuantity!==null} label="Organization delivery" />}
    {membershipId && <p className="t-caption text-ink-3">Organization limit: {setting.organizationMaximumQuantity === null ? "Not configured" : `${setting.organizationMaximumQuantity} ${selectedUnit}`}</p>}
    {!setting.nonzeroAvailable && <p className="mt-2 t-body text-ink-2">This meter is unavailable. An existing limit can only be set to zero.</p>}
    <form onSubmit={submit} className="mt-4 space-y-4"><div className="grid max-w-xl gap-4 sm:grid-cols-2">
      <Field label={`Maximum for ${title}`}><Input inputMode="decimal" value={quantity} disabled={busy || conflict} onChange={event => { setQuantity(event.target.value); setSaved(false); }} placeholder="Not configured" aria-invalid={quantity !== "" && !parsedQuantity.success} /></Field>
      <Field label={`Unit for ${title}`}><Input value={selectedUnit} disabled={busy || conflict || knownUnit !== null} onChange={event => { setUnit(event.target.value); setSaved(false); }} placeholder="Meter unit" aria-invalid={selectedUnit !== "" && !parsedUnit.success} /></Field>
    </div>
    {knownUnit === null && <p className="t-caption text-ink-3">Use the unit defined by the application’s meter. It cannot be changed after the first save.</p>}
    {quantity !== "" && !parsedQuantity.success && <p className="t-caption text-critical-text">Enter a nonnegative quantity with up to 12 whole and 6 decimal digits.</p>}
    <Button type="submit" disabled={!valid || !available || busy || conflict || (parsedQuantity.success && parsedQuantity.data === savedQuantity)}>{busy ? "Saving…" : "Save limit"}</Button>
    {conflict && <Button type="button" variant="secondary" className="ml-2" onClick={() => window.location.reload()}>Reload settings</Button>}
    {error && <p role="alert" className="t-body text-critical-text">{error}</p>}
    {saved && <p role="status" className="t-body">Limit saved. Enforcement is not confirmed.</p>}
    </form></CardContent></Card>;
}

const deliveryLabels: Record<UsageLimitDelivery['status'],string> = {
  pending:'Awaiting delivery',running:'Delivery in progress',retry_wait:'Waiting to retry',succeeded:'Provider readback received',failed:'Needs attention',superseded:'Request no longer current',
};
function LimitDelivery({delivery,configured,label}:{delivery:UsageLimitDelivery|null;configured:boolean;label:string}) {
  if (!configured) return null;
  return <div className="mt-3 space-y-2 t-caption text-ink-2" aria-label={label}>
    <p>{label}: {delivery?deliveryLabels[delivery.status]:'Awaiting status update'}</p>
    {delivery && <><p>{delivery.attemptCount} of 5 attempts used</p>
      {delivery.status==='succeeded' && <p>This records a past check of this limit. It does not confirm current product access or every applicable limit.</p>}
      {delivery.failureCode && <p className="break-all">Delivery issue: {delivery.failureCode.replaceAll('_',' ')}</p>}
      {delivery.nextAttemptAt && <p>Next retry after <UtcTime value={delivery.nextAttemptAt} /></p>}
      <p>Status recorded <UtcTime value={delivery.updatedAt} /></p>
      {delivery.attempts.length>0 && <details><summary className="cursor-pointer">Delivery attempts</summary><ol className="mt-2 space-y-2">{delivery.attempts.map(attempt=><li key={attempt.number}>
        <p>Attempt {attempt.number}: {(attempt.outcome??'in progress').replaceAll('_',' ')}</p><UtcTime value={attempt.startedAt} />
        {attempt.finishedAt && <p>Finished <UtcTime value={attempt.finishedAt} /></p>}
        {attempt.failureCode && <p>{attempt.failureCode.replaceAll('_',' ')}</p>}
      </li>)}</ol></details>}
    </>}
  </div>;
}
function UtcTime({value}:{value:string}) {return <time dateTime={value}>{new Date(value).toISOString().replace('T',' ').slice(0,19)} UTC</time>;}
