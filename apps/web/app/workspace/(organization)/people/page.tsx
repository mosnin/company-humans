import Link from "next/link";
import { listPeople } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { InvitePerson, PeopleTable } from "@/components/administration/people";
import { Input } from "@/components/administration/controls";
import { Button } from "@/components/ui/button";
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const workspace = await getWorkspace(); if (!workspace) return null;
  const context = workspace.context;
  if (!context.capabilities.includes("members.manage")) return <PageHeader title="People access restricted" description="Your role cannot manage organization members." />;
  const search = await searchParams; const query = typeof search.q === "string" ? search.q : "";
  const data = process.env.DATABASE_SERVICE_URL ? await listPeople(process.env.DATABASE_SERVICE_URL, context.userId, context.organizationId, query, Number(search.page ?? 1)).catch(() => null) : null;
  if (!data) return <PageHeader title="People unavailable" description="We could not load your organization members. Please try again." />;
  return <><PageHeader title="People" description="Manage invitations, roles, and access to your organization." />
    <InvitePerson organizationId={context.organizationId} owner={context.roleKey === "owner"} />
    <Link className="mb-4 inline-block t-link" href="/workspace/people/invitations">Review invitations</Link>
    <form className="mb-4 flex max-w-md gap-2"><Input name="q" aria-label="Search people" placeholder="Search by name or email" defaultValue={query} /><Button variant="secondary" type="submit">Search</Button></form>
    <PeopleTable people={data.people} organizationId={context.organizationId} actorUserId={context.userId} owner={context.roleKey === "owner"} />
    <nav aria-label="People pages" className="mt-4 flex items-center justify-between t-body"><span>{data.total} people</span><div className="flex gap-4">{data.page > 1 && <Link className="t-link" href={`?q=${encodeURIComponent(query)}&page=${data.page-1}`}>Previous</Link>}{data.page * 50 < data.total && <Link className="t-link" href={`?q=${encodeURIComponent(query)}&page=${data.page+1}`}>Next</Link>}</div></nav>
  </>;
}
