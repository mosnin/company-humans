import { NextResponse, type NextRequest } from "next/server";

/** Cookie-authenticated browser mutations must originate from this exact web origin.
 * Provider callbacks and future signed integration APIs use separate authentication boundaries.
 */
export function rejectCrossOriginMutation(request: NextRequest): NextResponse | null {
  // Next's proxy can normalize the internal URL host. Host is the browser's destination
  // authority; never substitute a client-supplied X-Forwarded-Host here.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const origin = `${request.nextUrl.protocol}//${host}`;
  if (request.headers.get("origin") === origin) return null;
  return NextResponse.json({ error: "Request denied" }, { status: 403, headers: { "cache-control": "no-store" } });
}
