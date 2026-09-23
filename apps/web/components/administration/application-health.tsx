"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationHealthDiagnostic } from "@company-human/database/administration";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const labels:Record<string,string>={healthy:"Healthy",degraded:"Degraded",authentication_required:"Authorization required",provisioning_failed:"Provisioning failed",rate_limited:"Rate limited",suspended:"Suspended",disconnected:"Disconnected"};
const failures:Record<string,string>={adapter_transport_failure:"The latest health check could not reach the product.",invalid_adapter_response:"The latest health response could not be verified.",future_observation:"The latest health response has an invalid observation time.",check_pending:"The product has not completed its health check.",authentication_required:"The product connection needs authorization.",rate_limited:"The product is limiting health requests.",provider_unavailable:"The latest provider check failed."};
function Time({value}:{value:string}){return <time dateTime={value}>{new Date(value).toISOString().replace("T"," ").slice(0,19)} UTC</time>;}
export function ApplicationHealth({health}:{health:ApplicationHealthDiagnostic|null}){
 const router=useRouter();const [refreshing,startRefresh]=useTransition();
 const assessment=health?.assessment;
 const observation=assessment && assessment.state!=="unknown" ? assessment.observation : null;
 const needsAuthorization=health?.failureCode==="authentication_required" || observation?.status==="authentication_required";
 const title=!health ? "Health not checked" : health.failureCode ? "Health check incomplete" : assessment?.state==="stale" ? "Health check is stale" : !observation ? "Health unknown" : `${labels[observation.status] ?? "Unknown"} at last check`;
 return <Card><CardContent><h2 className="t-title-3">{title}</h2>
  <p className="t-body text-ink-2">Connection health is separate from member access and usage limits.</p>
  {!health && <p className="t-body">No health observation has been recorded for this connection.</p>}
  {health?.failureCode && <p className="t-body text-critical-text">{failures[health.failureCode] ?? "The latest health check failed."} Previous successful checks do not confirm current health.</p>}
  {assessment?.state==="stale" && <p className="t-body text-ink-2">This observation is outside the monitoring freshness window. Current provider health is unknown.</p>}
  {assessment?.state==="unknown" && <p className="t-body text-ink-2">The latest observation cannot establish provider health.</p>}
  {health && <dl className="mt-4 grid gap-2 t-body">
   <dt className="font-medium">Check started</dt><dd><Time value={health.startedAt}/></dd>
   <dt className="font-medium">Result recorded</dt><dd><Time value={health.recordedAt}/></dd>
   {observation && <><dt className="font-medium">Reported status</dt><dd>{labels[observation.status] ?? "Unknown"}</dd>
    <dt className="font-medium">Provider observation</dt><dd><Time value={observation.checkedAt}/></dd>
    <dt className="font-medium">Last successful sync</dt><dd>{observation.lastSuccessfulSyncAt ? <Time value={observation.lastSuccessfulSyncAt}/> : "Not reported"}</dd>
    <dt className="font-medium">Last failure</dt><dd>{observation.lastFailureAt ? <Time value={observation.lastFailureAt}/> : "Not reported"}</dd>
    <dt className="font-medium">Affected members</dt><dd>{observation.affectedMembers ?? "Not reported"}</dd></>}
  </dl>}
  {needsAuthorization && <p className="mt-4 t-body">This connection needs to be authorized again. Reauthorization is not available here yet.</p>}
  <div className="mt-5 space-y-2"><Button variant="secondary" disabled={refreshing} onClick={()=>startRefresh(()=>router.refresh())}>{refreshing ? "Refreshing…" : "Refresh recorded status"}</Button>
   <p className="t-caption text-ink-3">Refresh reloads saved results. It does not run a new provider check. Freshness is assessed when this page loads.</p></div>
 </CardContent></Card>;
}
