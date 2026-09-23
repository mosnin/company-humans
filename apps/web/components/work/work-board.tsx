"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, mutate } from "@/components/administration/controls";

export interface WorkItem {
  id: string;
  title: string;
  objective: string;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  expectedOutcome: string;
  evidenceRequired: boolean;
  assigneeDisplayName: string;
  completion: null | { outcome: string; evidence: string | null; completedAt: string };
}

export interface WorkCandidate {
  membershipId: string;
  displayName: string;
  teamId: string | null;
  teamName?: string | null;
}

function utcTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " UTC";
}

function groupOpen(item: WorkItem, todayEndIso: string): "today" | "upcoming" {
  if (!item.dueAt) return "today";
  return item.dueAt <= todayEndIso ? "today" : "upcoming";
}

function CompletionForm({ item, organizationId }: { item: WorkItem; organizationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/organizations/${organizationId}/work/${item.id}/complete`, "POST", {
        outcome: String(data.get("outcome") ?? "").trim(),
        evidence: String(data.get("evidence") ?? "").trim() || null,
      });
      form.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not report completion. Try again.");
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-4 border-t border-border pt-5">
    <Field label="What did you accomplish?"><Input name="outcome" maxLength={500} required disabled={busy} placeholder="Describe the result" /></Field>
    <Field label={item.evidenceRequired ? "Evidence (required)" : "Evidence (optional)"}><Input name="evidence" maxLength={1000} required={item.evidenceRequired} disabled={busy} placeholder="Link or short description" /></Field>
    <div className="flex flex-wrap items-center gap-4"><Button type="submit" variant="primary" loading={busy} disabled={busy}>Report complete</Button><span className="t-caption text-ink-3">Your manager can review this report.</span></div>
    {error && <p role="alert" className="t-caption text-critical-text">{error}</p>}
  </form>;
}

function AssignmentCard({ item, organizationId, showCompletion }: { item: WorkItem; organizationId: string; showCompletion: boolean }) {
  return <Card><CardContent className="gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="t-title-3">{item.title}</h3><p className="mt-2 t-body text-ink-2">{item.objective}</p></div><span className="rounded-8 bg-inset px-3 py-1 t-caption capitalize text-ink-2">{item.priority} priority</span></div>
    <div className="flex flex-wrap gap-x-5 gap-y-1 t-caption text-ink-3"><span>{item.dueAt ? `Due ${utcTime(item.dueAt)}` : "No due date"}</span><span>Assigned to {item.assigneeDisplayName}</span></div>
    <p className="t-body"><span className="font-medium">Expected outcome:</span> {item.expectedOutcome}</p>
    {item.completion
      ? <div className="rounded-8 border border-border bg-inset p-4"><p className="t-body-medium">Reported complete · {utcTime(item.completion.completedAt)}</p><p className="mt-2 t-body text-ink-2">{item.completion.outcome}</p>{item.completion.evidence && <p className="mt-2 break-words t-caption text-ink-3">Evidence: {item.completion.evidence}</p>}</div>
      : showCompletion && <CompletionForm item={item} organizationId={organizationId} />}
  </CardContent></Card>;
}

function NewAssignment({ organizationId, candidates }: { organizationId: string; candidates: WorkCandidate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const [assigneeMembershipId, teamId] = String(data.get("assignee") ?? "").split("|");
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/organizations/${organizationId}/work`, "POST", {
        assigneeMembershipId,
        teamId: teamId || null,
        title: String(data.get("title") ?? "").trim(),
        objective: String(data.get("objective") ?? "").trim(),
        expectedOutcome: String(data.get("expectedOutcome") ?? "").trim(),
        dueAt: data.get("dueAt") ? new Date(String(data.get("dueAt"))).toISOString() : null,
        priority: data.get("priority"),
        evidenceRequired: data.get("evidenceRequired") === "on",
      });
      form.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not assign work. Try again.");
    } finally { setBusy(false); }
  }
  return <Card><CardContent><h2 className="t-title-3">Assign work</h2>
    {candidates.length === 0 ? <p className="t-body text-ink-2">No active members are available in your assignment scope.</p> : <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Assignee"><Select name="assignee" required disabled={busy} defaultValue=""><option value="" disabled>Choose a person</option>{candidates.map(candidate => <option key={`${candidate.membershipId}|${candidate.teamId ?? ""}`} value={`${candidate.membershipId}|${candidate.teamId ?? ""}`}>{candidate.displayName}{candidate.teamName ? ` · ${candidate.teamName}` : ""}</option>)}</Select></Field>
      <Field label="Due time"><Input name="dueAt" type="datetime-local" disabled={busy} /></Field>
      <Field label="Title"><Input name="title" maxLength={160} required disabled={busy} placeholder="What needs to be done?" /></Field>
      <Field label="Priority"><Select name="priority" defaultValue="normal" disabled={busy}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select></Field>
      <Field label="Objective"><Input name="objective" maxLength={1000} required disabled={busy} placeholder="Why this work matters" /></Field>
      <Field label="Expected outcome"><Input name="expectedOutcome" maxLength={500} required disabled={busy} placeholder="What success looks like" /></Field>
      <label className="flex items-center gap-3 t-body sm:col-span-2"><input type="checkbox" name="evidenceRequired" defaultChecked disabled={busy} className="size-4" />Require completion evidence</label>
      <div className="flex items-center gap-4 sm:col-span-2"><Button type="submit" variant="primary" loading={busy} disabled={busy}>Assign work</Button>{error && <p role="alert" className="t-caption text-critical-text">{error}</p>}</div>
    </form>}
  </CardContent></Card>;
}

export function WorkBoard({ organizationId, items, candidates, view, canManage, todayEndIso, offset, nextOffset }: { organizationId: string; items: WorkItem[]; candidates: WorkCandidate[]; view: "mine" | "team"; canManage: boolean; todayEndIso: string; offset: number; nextOffset: number | null }) {
  const today = items.filter(item => !item.completion && groupOpen(item, todayEndIso) === "today");
  const upcoming = items.filter(item => !item.completion && groupOpen(item, todayEndIso) === "upcoming");
  const completed = items.filter(item => item.completion);
  const list = (label: string, work: WorkItem[], empty: string) => <section className="grid gap-4" aria-label={label}><h2 className="t-label-caps text-ink-3">{label} · {work.length}</h2>{work.length ? work.map(item => <AssignmentCard key={item.id} item={item} organizationId={organizationId} showCompletion={view === "mine"} />) : <p className="rounded-12 border border-border bg-raised p-6 t-body text-ink-2">{empty}</p>}</section>;
  return <div className="grid gap-7">
    {canManage && <nav aria-label="Work views" className="flex gap-5 border-b border-border pb-3 t-body-medium"><Link className={view === "mine" ? "text-ink" : "t-link"} href="/workspace/work">My work</Link><Link className={view === "team" ? "text-ink" : "t-link"} href="/workspace/work?view=team">Team work</Link></nav>}
    {view === "team" && <NewAssignment organizationId={organizationId} candidates={candidates} />}
    {list("Due today (UTC), overdue and unscheduled", today, view === "mine" ? "You have no work due today." : "No team work is due today.")}
    {list("Upcoming", upcoming, "No upcoming assignments.")}
    {list("Reported complete", completed, "No completed work has been reported yet.")}
    <nav aria-label="Assignment pages" className="flex flex-wrap items-center justify-between gap-4 t-caption text-ink-3"><span>{items.length ? `Showing assignments ${offset + 1}–${offset + items.length}` : "No assignments on this page"}</span><span className="flex gap-5">{offset > 0 && <Link className="t-link" href={`/workspace/work${view === "team" ? "?view=team&" : "?"}offset=${Math.max(0, offset - 50)}`}>Previous</Link>}{nextOffset !== null && <Link className="t-link" href={`/workspace/work${view === "team" ? "?view=team&" : "?"}offset=${nextOffset}`}>Next</Link>}</span></nav>
  </div>;
}
