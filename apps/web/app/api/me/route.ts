import { NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await resolveAuthenticatedUser();
    if (result.status === "unavailable") return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
    if (result.status === "unauthenticated") return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (result.status === "forbidden") return NextResponse.json({ error: "User unavailable" }, { status: 403 });
    return NextResponse.json({ userId: result.userId }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Identity unavailable" }, { status: 503 });
  }
}
