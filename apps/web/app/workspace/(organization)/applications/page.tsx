import Link from "next/link";
import { listApplicationDiagnostics } from "@company-human/database/administration";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { ApplicationDiagnostics } from "@/components/administration/applications";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) return null;
  const { context } = workspace;
  if (!context.capabilities.includes("applications.manage")) return <PageHeader title="Applications access restricted" description="Your role cannot administer workspace applications." />;
  const page = Number((await searchParams).page ?? 1);
  const data = process.env.DATABASE_SERVICE_URL
    ? await listApplicationDiagnostics(process.env.DATABASE_SERVICE_URL, context.userId, context.organizationId, page).catch(() => null) : null;
  if (!data) return <PageHeader title="Applications unavailable" description="We could not load setup progress. Please try again." actions={<Link href="/workspace/applications" className="t-link">Try again</Link>} />;
  return <><PageHeader title="Applications" description="Review application setup and connection attempts for your workspace." actions={<Link href="/workspace/applications" className="t-link">Refresh status</Link>} />
    <ApplicationDiagnostics organizationId={context.organizationId} applications={data.applications} />
    <nav aria-label="Application pages" className="mt-4 flex justify-between gap-4 t-body"><span>{data.total} configured applications</span><div className="flex gap-4">
      {data.page > 1 && <Link className="t-link" href={`?page=${data.page - 1}`}>Previous</Link>}
      {data.page * 50 < data.total && <Link className="t-link" href={`?page=${data.page + 1}`}>Next</Link>}
    </div></nav>
  </>;
}
