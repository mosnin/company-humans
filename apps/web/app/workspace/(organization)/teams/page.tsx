import { listPeople, listTeams } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { TeamsEditor } from "@/components/administration/teams";
import { Input } from "@/components/administration/controls";
import { Button } from "@/components/ui/button";
export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const workspace = await getWorkspace(); if (!workspace) return null; const context = workspace.context;
  const canCreate = context.capabilities.includes("teams.create"); const canAssign = context.capabilities.includes("teams.manage.all") && context.capabilities.includes("members.manage");
  if (!canCreate && !context.capabilities.includes("teams.manage.all")) return <PageHeader title="Team access restricted" description="Your role cannot manage organization teams." />;
  const query = (await searchParams).q ?? ""; const url = process.env.DATABASE_SERVICE_URL;
  const data = url ? await Promise.all([listTeams(url,context.userId,context.organizationId), canAssign ? listPeople(url,context.userId,context.organizationId,query) : Promise.resolve({ people: [],total: 0 })]).catch(() => null) : null;
  if (!data) return <PageHeader title="Teams unavailable" description="We could not load your teams. Please try again." />;
  return <><PageHeader title="Teams" description="Group people and assign team managers." />
    {canAssign && <form className="mb-6 flex flex-wrap items-end gap-3"><label className="grid gap-2 t-body-medium">Find a person to assign<Input name="q" defaultValue={query} placeholder="Search by name or email" /></label><Button type="submit" variant="secondary">Search people</Button><p className="w-full t-caption text-ink-3">{data[1].total} people match. Up to 50 results are available for assignment.</p></form>}
    <TeamsEditor organizationId={context.organizationId} teams={data[0]} people={data[1].people} canCreate={canCreate} canAssign={canAssign} />
  </>;
}
