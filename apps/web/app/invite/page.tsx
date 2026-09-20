"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function AcceptInvitationPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted" | "sign_in" | "unavailable" | "failed">("idle");

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (fragment) setToken(fragment);
  }, []);

  async function accept(): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setStatus("failed"); return; }
    setStatus("submitting");
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (response.status === 401) { setStatus("sign_in"); return; }
      if (response.status === 503) { setStatus("unavailable"); return; }
      if (!response.ok) { setStatus("failed"); return; }
      setStatus("accepted");
      window.location.replace("/workspace/select");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Join your organization" description="Accept your invitation to open the workspace your team sponsors." />
        <Card className="max-w-2xl"><CardContent>
          <p className="t-body text-ink-2">Sign in with the email address that received this invitation before accepting.</p>
          <label className="mt-6 grid gap-2 t-body-medium" htmlFor="invitation-token">
            Invitation code
            <input id="invitation-token" className="h-10 rounded-8 border border-border bg-raised px-4 t-body text-ink focus-ring"
              value={token} onChange={(event) => setToken(event.target.value.trim())} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          {status === "sign_in" ? <p role="status" className="t-body mt-5">Sign in, then return to this invitation link. <Link className="t-link" href="/sign-in">Sign in</Link></p> : null}
          {status === "failed" ? <p role="alert" className="t-body mt-5 text-critical-text">This invitation could not be accepted. It may be expired, already used, or intended for another email address.</p> : null}
          {status === "unavailable" ? <p role="alert" className="t-body mt-5 text-critical-text">Invitations are temporarily unavailable. Please try again later.</p> : null}
          {status === "accepted" ? <p role="status" className="t-body mt-5">Invitation accepted. Opening your organizations.</p> : null}
          <Button className="mt-6" onClick={() => void accept()} loading={status === "submitting"}
            disabled={status === "submitting" || status === "accepted"}>Accept invitation</Button>
        </CardContent></Card>
      </div>
    </main>
  );
}
