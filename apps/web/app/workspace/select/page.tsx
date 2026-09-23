"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface OrganizationOption { id: string; name: string; slug: string; roleKey: string }

export default function SelectOrganizationPage() {
  const [organizations, setOrganizations] = useState<OrganizationOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/organizations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Sign in to see your organizations." : "Organizations are unavailable right now.");
        return response.json() as Promise<{ organizations: OrganizationOption[] }>;
      })
      .then((data) => setOrganizations(data.organizations))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Organizations are unavailable right now.");
      });
    return () => controller.abort();
  }, []);

  async function switchTo(organizationId: string): Promise<void> {
    setError(null);
    setSwitchingId(organizationId);
    try {
      const response = await fetch("/api/organizations/switch", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error("You cannot open that organization right now.");
      window.location.assign("/workspace");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Organization switch failed.");
      setSwitchingId(null);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/organizations", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });
      const data = await response.json() as { organizationId?: string; error?: string };
      if (!response.ok || !data.organizationId) throw new Error(data.error ?? "Organization could not be created.");
      setOrganizations((current) => [...(current ?? []), { id: data.organizationId!, name: name.trim(), slug: slug.trim(), roleKey: "owner" }]);
      await switchTo(data.organizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Organization could not be created.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-border bg-rail">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-8 t-body-medium">Company Human</div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <PageHeader title="Choose an organization" description="Your work and access stay within the organization you select." />
        {error ? <p role="alert" className="t-body mb-5 text-critical-text">{error}</p> : null}
        {error?.startsWith("Sign in") ? <Link className="t-link t-body mb-5 inline-block" href="/sign-in">Sign in</Link> : null}
        {organizations === null && !error ? <Card className="max-w-2xl" padded><Skeleton className="h-5 w-48" /></Card> : null}
        {organizations?.length === 0 ? (
          <Card className="max-w-2xl"><CardContent><p className="t-body text-ink-2">You do not have an active organization yet. Create one for your team or ask an admin for an invitation.</p></CardContent></Card>
        ) : null}
        {organizations !== null ? (
          <Card className="mt-8 max-w-2xl">
            <CardContent>
              <h2 className="t-title-3">Create an organization</h2>
              <p className="t-body mt-3 text-ink-2">This creates a separate workspace with its own members and billing responsibility.</p>
              <form className="mt-6 grid gap-5" onSubmit={(event) => void createWorkspace(event)}>
                <label className="grid gap-2 t-body-medium" htmlFor="organization-name">
                  Organization name
                  <input id="organization-name" className="h-10 rounded-8 border border-border bg-raised px-4 t-body text-ink focus-ring"
                    value={name} maxLength={256} required onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="grid gap-2 t-body-medium" htmlFor="organization-slug">
                  URL name
                  <input id="organization-slug" className="h-10 rounded-8 border border-border bg-raised px-4 t-body text-ink focus-ring"
                    value={slug} pattern="[a-z][a-z0-9-]{2,62}" minLength={3} maxLength={63} required
                    autoCapitalize="none" autoCorrect="off" onChange={(event) => setSlug(event.target.value.toLowerCase())} />
                </label>
                <Button type="submit" className="justify-self-start" loading={creating} disabled={creating || switchingId !== null}>Create organization</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
        {organizations && organizations.length > 0 ? (
          <div className="grid max-w-2xl gap-4">
            {organizations.map((organization) => (
              <Card key={organization.id}>
                <CardContent className="flex items-center justify-between gap-5">
                  <div className="min-w-0">
                    <h2 className="t-title-3 truncate">{organization.name}</h2>
                    <p className="t-caption text-ink-3">{organization.roleKey}</p>
                  </div>
                  <Button onClick={() => void switchTo(organization.id)} loading={switchingId === organization.id} disabled={switchingId !== null}>
                    Open
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
