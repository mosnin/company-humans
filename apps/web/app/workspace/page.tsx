import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OrganizationIdSchema } from "@company-human/contracts";
import { listVisibleOrganizations, resolveAccessContext } from "@company-human/database/rls";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unauthenticated") return <WorkspaceMessage title="Sign in required" message="Sign in to open your organization." />;
  if (identity.status !== "ok") return <WorkspaceMessage title="Workspace unavailable" message="Identity is not configured or is temporarily unavailable." />;
  const databaseUrl = process.env.DATABASE_RUNTIME_URL;
  if (!databaseUrl) return <WorkspaceMessage title="Workspace unavailable" message="Tenant database access is not configured." />;
  const selected = OrganizationIdSchema.safeParse((await cookies()).get("ch_active_org")?.value);
  if (!selected.success) redirect("/workspace/select");
  const data = await Promise.all([
    resolveAccessContext(databaseUrl, identity.userId, selected.data),
    listVisibleOrganizations(databaseUrl, identity.userId),
  ]).catch(() => null);
  if (!data) return <WorkspaceMessage title="Workspace unavailable" message="Organization access could not be checked." />;
  const [context, organizations] = data;
  if (!context) redirect("/workspace/select");
  const organization = organizations.find((item) => item.id === context.organizationId);
  if (!organization) redirect("/workspace/select");
  return (
      <main className="min-h-screen bg-canvas text-ink">
        <header className="border-b border-border bg-rail">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-8">
            <span className="t-body-medium">Company Human</span>
            <Link className="t-link t-body" href="/workspace/select">Switch organization</Link>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
          <PageHeader title={organization.name} description="Your organization workspace" />
          <Card className="max-w-2xl"><CardContent>
            <h2 className="t-title-3">Organization selected</h2>
            <p className="t-body text-ink-2">You are here as a {context.roleKey}. Your work and tools are scoped to this organization.</p>
          </CardContent></Card>
        </div>
      </main>
  );
}

function WorkspaceMessage({ title, message }: { title: string; message: string }) {
  return <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-8"><div className="mx-auto max-w-5xl"><PageHeader title={title} description={message} /></div></main>;
}
