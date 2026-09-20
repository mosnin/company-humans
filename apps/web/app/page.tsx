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
          description="See the work ahead, the relationships moving, the tools available, and the money earned."
        />
        <Link className="t-link t-body-medium mb-8 inline-block" href="/workspace/select">Open your workspace</Link>
        <Card className="max-w-2xl">
          <CardContent>
            <h2 className="t-title-3 text-ink">Built for the people behind the outcomes</h2>
            <p className="t-body mt-4 text-ink-2">
              Company Human brings a team’s work, access, and progress into one workspace. Each organization chooses the tools its people need and sponsors their use.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
