import Link from "next/link";
import { listInvitations } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { InvitationsTable } from "@/components/administration/invitations";
export default async function InvitationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const workspace = await getWorkspace(); if (!workspace) return null;
  const context = workspace.context;
  if (!context.capabilities.includes("members.manage")) return <PageHeader title="Invitations restricted" description="Your role cannot manage organization invitations." />;
  const search = await searchParams;
  const data = process.env.DATABASE_SERVICE_URL ? await listInvitations(process.env.DATABASE_SERVICE_URL, context.userId, context.organizationId, Number(search.page ?? 1)).catch(() => null) : null;
  if (!data) return <PageHeader title="Invitations unavailable" description="We could not load invitations. Please try again." />;
  return <><PageHeader title="Invitations" description="Review invitations and revoke links that should no longer grant access." />
    <Link className="mb-4 inline-block t-link" href="/workspace/people">Back to people</Link>
    <InvitationsTable invitations={data.invitations} organizationId={context.organizationId} owner={context.roleKey === "owner"} />
    <nav aria-label="Invitation pages" className="mt-4 flex items-center justify-between t-body"><span>{data.total} invitations</span><div className="flex gap-4">{data.page > 1 && <Link className="t-link" href={`?page=${data.page-1}`}>Previous</Link>}{data.page * 50 < data.total && <Link className="t-link" href={`?page=${data.page+1}`}>Next</Link>}</div></nav>
  </>;
}
