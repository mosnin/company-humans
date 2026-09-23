import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
const authProxy = process.env.NEXT_PUBLIC_CONVEX_URL ? convexAuthNextjsMiddleware() : null;
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return authProxy ? authProxy(request, event) : NextResponse.next();
}
export const config = { matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"] };
