"use client";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function OAuthSignIn({ returnToInvite, providers }: { returnToInvite: boolean; providers: string[] }) {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);
  async function start(provider: string) {
    setPending(provider); setError(false);
    try {
      await signIn(provider, { redirectTo: returnToInvite ? "/auth/complete?returnTo=invite" : "/auth/complete" });
    } catch { setError(true); setPending(null); }
  }
  return <Card className="max-w-md"><CardContent className="grid gap-4">
    {providers.map(provider => <Button key={provider} loading={pending === provider} disabled={pending !== null} onClick={() => void start(provider)}>
      Continue with {provider === "google" ? "Google" : "GitHub"}
    </Button>)}
    {error ? <p role="alert" className="t-body text-critical-text">Sign-in could not start. Please try again.</p> : null}
  </CardContent></Card>;
}
