import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return (
      <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-8">
        <div className="mx-auto max-w-5xl">
          <PageHeader title="Sign in unavailable" description="Organization sign in has not been configured yet." />
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Sign in" description="Open your organization workspace." />
        <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/workspace/select" signUpFallbackRedirectUrl="/workspace/select" />
      </div>
    </main>
  );
}
