import type { Metadata } from "next";
import { EmailSignIn } from "@/components/auth/email-sign-in";
export const metadata: Metadata = { title: "Confirm sign-in", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function EmailSignInPage({ searchParams }: { searchParams: Promise<{ email?: string; token?: string; returnTo?: string }> }) {
  const params = await searchParams;
  return <EmailSignIn email={params.email} token={params.token} returnToInvite={params.returnTo === "invite"} />;
}
