"use client";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export function EmailSignIn({ email, token, returnToInvite }: { email?: string; token?: string; returnToInvite: boolean }) {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function complete() {
    setPending(true); setError(false);
    try {
      const code = token;
      if (!email || !code) throw new Error("Invalid link");
      const result = await signIn("email", { email, code });
      if (!result.signingIn) throw new Error("Invalid link");
      window.history.replaceState(null, "", "/sign-in/email");
      window.location.replace(returnToInvite ? "/auth/complete?returnTo=invite" : "/auth/complete");
    } catch { setError(true); setPending(false); }
  }
  return <main className="min-h-screen bg-canvas p-8 text-ink"><div className="mx-auto max-w-md space-y-4">
    <PageHeader title="Confirm sign-in" description="Continue only if you requested this link." />
    {email ? <p>Sign in as {email}</p> : null}
    <Button loading={pending} disabled={pending} onClick={() => void complete()}>Continue to Company Human</Button>
    {error ? <p role="alert">This link is invalid or expired. <a className="t-link" href="/sign-in">Request a new link</a>.</p> : null}
  </div></main>;
}
