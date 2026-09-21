"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, mutate } from "./controls";
import type { ApplicationDiagnostic } from "@company-human/database/administration";
import { Card, CardContent } from "@/components/ui/card";

function status(application: ApplicationDiagnostic): string {
  if (!application.desiredEnabled) return "Disabled in workspace";
  if (application.provisioningStatus === "active") return "Organization connected";
  if ((application.operation?.status === "failed" || application.provisioningStatus === "failed")) return "Setup needs attention";
  if (application.operation?.status === "retry_wait") return "Waiting to retry";
  if (application.operation?.status === "running") return "Setup in progress";
  if (application.operation?.status === "succeeded") return "Awaiting activation";
  if (application.provisioningStatus === "suspended") return "Suspended";
  if (application.provisioningStatus === "disconnected") return "Disconnected";
  return "Setup pending";
}
function explanation(application: ApplicationDiagnostic): string {
  if (!application.desiredEnabled) return "New workspace access is disabled. Remote access changes have not been confirmed.";
  if (application.provisioningStatus === "active") return "The product organization is connected. Member access, limits and current service health are verified separately.";
  if ((application.operation?.status === "failed" || application.provisioningStatus === "failed")) return "Setup has stopped. Review the attempt history before correcting the connection or requesting another attempt.";
  if (application.operation?.status === "retry_wait") return "An earlier attempt did not finish. The next attempt is eligible at the time shown below.";
  if (application.operation?.status === "running") return "Application setup has started. Progress may be delayed if the connection is interrupted.";
  if (application.provisioningStatus === "suspended") return "This application connection is suspended.";
  if (application.provisioningStatus === "disconnected") return "This workspace is no longer connected to the product organization.";
  return "An enable request has been recorded. It does not grant product access until setup completes.";
}
const modes: Record<string, string> = { provisioned: "New organization", connected: "Existing organization", external_only: "External link", native_module: "Workspace module" };
const displayTime = (value: string) => new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC";
export function ApplicationDiagnostics({ applications, organizationId }: { applications: ApplicationDiagnostic[]; organizationId: string }) {
  const [disabledIds,setDisabledIds] = useState<string[]>([]);
  if (!applications.length) return <Card><CardContent><h2 className="t-title-3">No applications configured</h2><p className="t-body text-ink-2">Applications requested for this workspace will appear here with their setup progress.</p></CardContent></Card>;
  return <div className="space-y-4">{applications.map(original => { const application = disabledIds.includes(original.id) ? {...original, desiredEnabled: false} : original; return <Card key={application.id}><CardContent>
    <div className="flex flex-col justify-between gap-3 sm:flex-row"><div><h2 className="t-title-3">{application.productName}</h2><p className="mt-1 t-caption text-ink-3 break-all">{application.instanceKey} · {modes[application.mode] ?? "Application connection"}</p></div><p role="status" className="t-body-medium">{status(application)}</p></div>
    <p className="t-body text-ink-2">{explanation(application)}</p>
    {application.operation && <>
      <p className="t-caption text-ink-3">{application.operation.attemptCount} of 5 setup attempts used</p>
      {application.operation.status === "retry_wait" && <p className="t-caption text-ink-2">Next eligible attempt: <time dateTime={application.operation.nextAttemptAt}>{displayTime(application.operation.nextAttemptAt)}</time></p>}
      {application.operation.failureCode && <p className="t-caption text-ink-2 break-all">Last result: {application.operation.failureCode.replaceAll("_", " ")}</p>}
      {!!application.operation.attempts.length && <details><summary className="t-body cursor-pointer text-ink-2">Setup attempt history</summary><ol className="mt-3 divide-y divide-border">{application.operation.attempts.map(attempt => <li key={attempt.number} className="py-3">
        <p className="t-body-medium">Attempt {attempt.number} · {(attempt.outcome ?? "In progress").replaceAll("_", " ")}</p>
        <p className="mt-1 t-caption text-ink-3"><time dateTime={attempt.startedAt}>{displayTime(attempt.startedAt)}</time></p>
        {attempt.failureCode && <p className="mt-1 t-caption text-ink-2 break-all">{attempt.failureCode.replaceAll("_", " ")}</p>}
      </li>)}</ol></details>}
    </>}
    {application.desiredEnabled && application.mode === "connected" && application.provisioningStatus === "pending" && !application.operation && <ConnectApplication application={application} organizationId={organizationId} />}
    <Link className="inline-block t-link" href={`/workspace/applications/${application.id}/members`}>View member access</Link>
    <Link className="ml-4 inline-block t-link" href={`/workspace/applications/${application.id}/entitlements`}>Access settings</Link>
    <Link className="ml-4 inline-block t-link" href={`/workspace/applications/${application.id}/usage-limits`}>Usage limits</Link>
    <Link className="ml-4 inline-block t-link" href={`/workspace/applications/${application.id}/health`}>Connection health</Link>
    {application.desiredEnabled && <DisableApplication application={application} organizationId={organizationId} onDisabled={() => setDisabledIds(ids => [...ids,application.id])} />}
  </CardContent></Card>; })}</div>;
}

function DisableApplication({ application, organizationId, onDisabled }: { application: ApplicationDiagnostic; organizationId: string; onDisabled: () => void }) {
  const router = useRouter();
  const [confirming,setConfirming] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  async function disable() {
    setBusy(true); setError("");
    try {
      await mutate(`/api/organizations/${organizationId}/applications/${application.id}/disable`,"POST",{});
      onDisabled(); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not disable application"); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-3">{confirming ? <>
    <p className="t-body">Disable {application.productName} for this workspace? New access will stop and member suspension requests will be recorded. Existing access in the connected product may continue until suspension is confirmed.</p>
    <p className="t-caption text-ink-2">Restoring access requires reconciliation and is not available here yet.</p>
    <div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={busy} onClick={() => void disable()}>{busy ? "Disabling…" : "Confirm disable"}</Button><Button variant="ghost" disabled={busy} onClick={() => {setConfirming(false);setError("");}}>Cancel</Button></div>
  </> : <Button variant="secondary" onClick={() => setConfirming(true)}>Disable application</Button>}
    {error && <p role="alert" className="t-body text-critical-text">{error}</p>}
  </div>;
}

function ConnectApplication({ application, organizationId }: { application: ApplicationDiagnostic; organizationId: string }) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitted || !target.trim()) return;
    setBusy(true); setError("");
    try {
      await mutate(`/api/organizations/${organizationId}/applications/${application.id}/connect`, "POST", { externalOrganizationId: target.trim() });
      setSubmitted(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request connection. Please retry."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={event => void connect(event)} className="my-4 space-y-3" aria-label={`Connect existing ${application.productName} organization`}>
    <p className="t-body text-ink-2">Enter the organization ID from {application.productName}. Connection requires authorization and ownership verification with the product before access can be enabled.</p>
    <Field label={`${application.productName} organization ID`}><Input value={target} onChange={event => setTarget(event.target.value)} required maxLength={256} disabled={busy || submitted} autoComplete="off" spellCheck={false} /></Field>
    <p className="t-caption text-ink-3">Use an organization ID, never an API key or password. The target cannot be changed after this request.</p>
    {submitted ? <p role="status" className="t-body">Connection requested. Provider verification is pending; product access has not been confirmed.</p> : <Button type="submit" disabled={busy || !target.trim()}>{busy ? "Requesting connection…" : "Request connection"}</Button>}
    {error && <p role="alert" className="t-body text-critical-text">{error}</p>}
  </form>;
}
