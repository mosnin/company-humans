import { NextRequest, NextResponse } from "next/server";
import { syncAuthUser, findCanonicalUser } from "@company-human/database/auth-users";
import { readProviderIdentity } from "@/lib/provider-identity";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Request denied" }, { status: 403 });
  const url = process.env.DATABASE_IDENTITY_URL;
  if (!url) return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  try {
    const identity = await readProviderIdentity();
    if (identity.status !== "ok") return NextResponse.json({ error: "Sign in required" }, { status: identity.status === "unavailable" ? 503 : 401 });
    const { issuer, profile } = identity;
    await syncAuthUser(url, { authIssuer: issuer, authSubject: profile.subject, primaryEmail: profile.verifiedEmail,
      displayName: profile.name, status: "active", eventTimestamp: profile.updatedAt });
    const userId = await findCanonicalUser(url, issuer, profile.subject);
    if (!userId) return NextResponse.json({ error: "User unavailable" }, { status: 403 });
    return NextResponse.json({ userId }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Identity unavailable" }, { status: 503 }); }
}
