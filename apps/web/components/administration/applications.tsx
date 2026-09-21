import type { ApplicationDiagnostic } from "@company-human/database/administration";
import { Card, CardContent } from "@/components/ui/card";

function status(application: ApplicationDiagnostic): string {
  if (!application.desiredEnabled) return "Disabled";
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
  if (!application.desiredEnabled) return "This application is disabled for the workspace.";
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
export function ApplicationDiagnostics({ applications }: { applications: ApplicationDiagnostic[] }) {
  if (!applications.length) return <Card><CardContent><h2 className="t-title-3">No applications configured</h2><p className="t-body text-ink-2">Applications requested for this workspace will appear here with their setup progress.</p></CardContent></Card>;
  return <div className="space-y-4">{applications.map(application => <Card key={application.id}><CardContent>
    <div className="flex flex-col justify-between gap-3 sm:flex-row"><div><h2 className="t-title-3">{application.productName}</h2><p className="mt-1 t-caption text-ink-3 break-all">{application.instanceKey} · {modes[application.mode] ?? "Application connection"}</p></div><p className="t-body-medium">{status(application)}</p></div>
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
  </CardContent></Card>)}</div>;
}
