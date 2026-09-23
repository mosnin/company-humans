import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-border bg-rail">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-8">
          <span className="t-body-medium">Company Human</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <PageHeader
          size="display"
          title="A clear place for people to work"
          description="Bring your team together, organize access, and see reported usage."
        />
        <Link className="t-link t-body-medium mb-8 inline-block" href="/workspace/select">Open your workspace</Link>
        <Card className="max-w-2xl">
          <CardContent>
            <h2 className="t-title-3 text-ink">Built for the people behind the outcomes</h2>
            <p className="t-body mt-4 text-ink-2">
              Invite your team, manage roles, and review application assignments in your organization’s workspace.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
