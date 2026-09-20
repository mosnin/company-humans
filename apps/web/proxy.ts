import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const clerkProxy = configured ? clerkMiddleware() : null;

export default function proxy(request: NextRequest, event: Parameters<NonNullable<typeof clerkProxy>>[1]) {
  if (!clerkProxy) return NextResponse.next();
  return clerkProxy(request, event);
}

export const config = { matcher: ["/api/:path*", "/workspace/:path*"] };
