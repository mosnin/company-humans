import { Email } from "@convex-dev/auth/providers/Email";

export const magicLink = Email({
  id: "email",
  maxAge: 15 * 60,
  async sendVerificationRequest({ identifier, token, url }) {
    const site = process.env.SITE_URL;
    const apiKey = process.env.AUTH_RESEND_KEY;
    const from = process.env.AUTH_EMAIL_FROM;
    if (!site || !apiKey || !from) throw new Error("Email sign-in unavailable");
    const link = new URL("/sign-in/email", site);
    link.searchParams.set("token", token);
    link.searchParams.set("email", identifier);
    if (new URL(url).searchParams.get("returnTo") === "invite") link.searchParams.set("returnTo", "invite");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: identifier, subject: "Sign in to Company Human",
        text: `Use this link to sign in to Company Human:\n\n${link.toString()}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.` }),
      signal: AbortSignal.timeout(10_000),
    });
    // Provider response bodies may contain recipient details; never expose them.
    if (!response.ok) throw new Error("Email sign-in unavailable");
  },
});
