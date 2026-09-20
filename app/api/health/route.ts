import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.json({
    service: "company-human",
    status: "ok",
    revision: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
