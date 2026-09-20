import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { saveOAuthUser } from "./authProfile";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    GitHub({
      allowDangerousEmailAccountLinking: false,
      async profile(profile, tokens) {
        const response = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "Company-Human" },
        });
        if (!response.ok) throw new Error("Email verification unavailable");
        const emails: unknown = await response.json();
        const primary = Array.isArray(emails) ? emails.find((item: unknown) =>
          item !== null && typeof item === "object" && "primary" in item && item.primary === true
          && "verified" in item && item.verified === true && "email" in item && typeof item.email === "string") : undefined;
        if (!primary) throw new Error("A verified primary email address is required");
        return { id: String(profile.id), name: profile.name ?? profile.login, email: primary.email as string, emailVerified: true };
      },
    }),
    Google({
      allowDangerousEmailAccountLinking: false,
      profile(profile) {
        if (profile.email_verified !== true) throw new Error("A verified email address is required");
        return { id: profile.sub, name: profile.name, email: profile.email, emailVerified: true };
      },
    }),
  ],
  callbacks: { createOrUpdateUser: saveOAuthUser },
});
