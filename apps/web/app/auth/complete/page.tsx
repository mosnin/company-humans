"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
export default function CompleteSignIn() {
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/identity/sync", { method: "POST", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Identity unavailable");
        window.location.replace(new URLSearchParams(window.location.search).get("returnTo") === "invite" ? "/invite" : "/workspace/select");
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  return <main className="min-h-screen bg-canvas p-8 text-ink">
    <PageHeader title={error ? "Unable to open your workspace" : "Opening your workspace"} description={error ? "Please sign in again to retry." : "Finishing sign-in…"} />
    {error ? <Link href="/sign-in" className="t-link">Return to sign in</Link> : null}
  </main>;
}
