"use client";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function OAuthSignIn({ returnToInvite, providers }: { returnToInvite: boolean; providers: string[] }) {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  async function start(provider: string, email?: string) {
    setPending(provider); setError(false);
    try {
      await signIn(provider, { ...(email ? { email: email.trim().toLowerCase() } : {}), redirectTo: returnToInvite ? "/auth/complete?returnTo=invite" : "/auth/complete" });
      if (provider === "email") { setSent(true); setPending(null); }
    } catch { setError(true); setPending(null); }
  }
  return <Card className="max-w-md"><CardContent className="grid gap-4">
    {providers.filter(provider => provider === "google").map(provider => <Button key={provider} loading={pending === provider} disabled={pending !== null} onClick={() => void start(provider)}>
      Continue with Google
    </Button>)}
    {providers.includes("email") ? sent ? <div role="status" className="grid gap-3"><p>Check your email for your sign-in link. It expires in 15 minutes.</p><p>Open the link in this browser to continue an invitation.</p><Button variant="secondary" onClick={() => setSent(false)}>Use another email or resend</Button></div> : <form className="grid gap-3" onSubmit={event => {
      event.preventDefault();
      const email = new FormData(event.currentTarget).get("email");
      if (typeof email === "string") void start("email", email);
    }}>
      <label htmlFor="sign-in-email">Email address</label>
      <input id="sign-in-email" name="email" type="email" autoComplete="email" required maxLength={254} className="rounded-md border border-line bg-canvas px-3 py-2 text-ink" disabled={pending !== null} />
      <Button type="submit" loading={pending === "email"} disabled={pending !== null}>Email me a sign-in link</Button>
    </form> : null}
    {error ? <p role="alert" className="t-body text-critical-text">Sign-in could not start. Please try again.</p> : null}
  </CardContent></Card>;
}
