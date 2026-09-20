import Link from "next/link";
import { listAuditEvents } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const workspace = await getWorkspace(); if (!workspace) return null; const context=workspace.context;
  if (!context.capabilities.includes("audit.read.all")) return <PageHeader title="Audit access restricted" description="Your role cannot read organization audit history." />;
  const page=Number((await searchParams).page ?? 1);
  const data=process.env.DATABASE_SERVICE_URL ? await listAuditEvents(process.env.DATABASE_SERVICE_URL,context.userId,context.organizationId,page).catch(()=>null) : null;
  if (!data) return <PageHeader title="Audit history unavailable" description="We could not load audit events. Please try again." />;
  return <><PageHeader title="Audit history" description="Recorded changes to your organization, people, teams, and permissions." />
    <Card><CardContent>{!data.events.length ? <p className="t-body text-ink-2">No events on this page.</p> : <ol className="divide-y divide-border">{data.events.map(event=><li key={event.id} className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col justify-between gap-2 sm:flex-row"><h2 className="t-body-medium capitalize">{event.action.replaceAll("."," ")}</h2><time className="t-caption text-ink-3" dateTime={event.occurredAt.toISOString()}>{event.occurredAt.toISOString().replace("T"," ").slice(0,19)} UTC</time></div>
      <p className="mt-1 t-body text-ink-2">By {event.actorName}</p>
      <details className="mt-3"><summary className="t-body cursor-pointer text-ink-2">View change details</summary><dl className="mt-3 space-y-2 break-all t-caption"><dt className="font-medium">Actor ID</dt><dd>{event.actorUserId}</dd><dt className="font-medium">Target</dt><dd>{event.targetType}: {event.targetId}</dd></dl>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{[["Before",event.beforeState],["After",event.afterState]].map(([label,state])=><div key={String(label)}><h3 className="mb-2 t-caption font-medium">{String(label)}</h3><pre className="whitespace-pre-wrap break-all rounded-8 bg-inset p-3 t-caption">{state ? JSON.stringify(state,null,2) : "No previous state"}</pre></div>)}</div>
      </details>
    </li>)}</ol>}</CardContent></Card>
    <nav aria-label="Audit pages" className="mt-4 flex justify-between t-body"><span>{data.total} recorded events</span><div className="flex gap-4">{data.page>1 && <Link className="t-link" href={`?page=${data.page-1}`}>Previous</Link>}{data.page*50<data.total && <Link className="t-link" href={`?page=${data.page+1}`}>Next</Link>}</div></nav>
  </>;
}
