import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/** Convex verifies the JWT and checks the live session, including revocation. */
export async function readProviderIdentity() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return { status: "unavailable" as const };
  const token = await convexAuthNextjsToken();
  if (!token) return { status: "unauthenticated" as const };
  try {
    const profile = await fetchQuery(api.identity.current, {}, { token, url });
    return profile ? { status: "ok" as const, issuer: new URL(url).origin, profile } : { status: "unauthenticated" as const };
  } catch { return { status: "unavailable" as const }; }
}
