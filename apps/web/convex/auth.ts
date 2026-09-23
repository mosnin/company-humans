import { magicLink } from "./magicLink";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { saveOAuthUser } from "./authProfile";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    magicLink,
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
