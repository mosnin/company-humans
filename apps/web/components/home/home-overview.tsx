import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export interface HomeAction {
  id: string;
  title: string;
  dueAt: string | null;
}

export interface HomeOverviewProps {
  admin: boolean;
  canReadUsage: boolean;
  workState: "off" | "unavailable" | "ready";
  actions: HomeAction[] | null;
  appRecordCount: number | null;
}

function dueLabel(dueAt: string | null): string {
  if (!dueAt) return "No due date";
  return `Due ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(dueAt))} UTC`;
}

export function HomeOverview({ admin, canReadUsage, workState, actions, appRecordCount }: HomeOverviewProps) {
  return <>
    {workState !== "off" && <section aria-label="Next actions" className="mb-5"><Card><CardContent>
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="t-title-3">What needs your attention</h2>{workState === "ready" && <Link href="/workspace/work" className="t-link t-body-medium">Open Work</Link>}</div>
      {workState === "unavailable" ? <p role="alert" className="mt-3 t-body text-ink-2">Work status could not be checked. Try again shortly.</p>
        : actions === null ? <p role="alert" className="mt-3 t-body text-ink-2">Your assignments could not be loaded. Try again shortly.</p>
        : actions.length === 0 ? <p className="mt-3 t-body text-ink-2">No open assignments are due right now.</p>
        : <ul className="mt-4 divide-y divide-border">{actions.map(item => <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <p className="t-body-medium">{item.title}</p><p className="mt-1 t-caption text-ink-3">{dueLabel(item.dueAt)}</p>
        </li>)}</ul>}
    </CardContent></Card></section>}
    <Card><CardContent><h2 className="t-title-3">{admin ? "Bring your team together" : "You’re part of the team"}</h2>
      <p className="mt-3 t-body text-ink-2">{admin ? "Invite people, organize teams, and set their access." : "Review your app access and current status."}</p>
      {appRecordCount === null ? <p role="alert" className="mt-3 t-caption text-ink-3">App access could not be loaded.</p>
        : <p className="mt-3 t-caption text-ink-3">{appRecordCount === 0 ? "No app access records yet." : "App access can be setting up, paused, or unavailable. Check each status before using a tool."}</p>}
      <div className="mt-5 flex flex-wrap gap-5">
        <Link href="/workspace/apps" className="t-link t-body-medium">View your apps</Link>
        {canReadUsage && <Link href="/workspace/usage" className="t-link t-body-medium">View usage</Link>}
        {admin && <Link href="/workspace/people" className="t-link t-body-medium">Manage people</Link>}
      </div>
    </CardContent></Card>
  </>;
}
