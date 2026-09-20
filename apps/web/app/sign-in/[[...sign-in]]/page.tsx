import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { OAuthSignIn } from "@/components/auth/sign-in";
export const metadata: Metadata = { title: "Sign in" };
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnToInvite = (await searchParams).returnTo === "invite";
  const providers = (process.env.AUTH_ENABLED_PROVIDERS ?? "").split(",").filter(p => p === "google" || p === "github");
  const available = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL && providers.length);
  return <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-8"><div className="mx-auto max-w-5xl">
    <PageHeader title={available ? "Sign in" : "Sign in unavailable"} description={available ? "Open your organization workspace." : "Organization sign in has not been configured yet."} />
    {available ? <OAuthSignIn returnToInvite={returnToInvite} providers={providers} /> : null}
  </div></main>;
}
