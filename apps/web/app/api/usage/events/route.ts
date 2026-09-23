import { NextRequest, NextResponse } from "next/server";
import { InvalidUsageTeamAttributionError, storeSignedUsage } from "@company-human/database/usage-ingestion";
import { resolveUsageAuthority } from "@/lib/usage-authority";
export const runtime = "nodejs";
const reply = (body: object, status: number) => NextResponse.json(body,{status,headers:{"cache-control":"no-store"}});
const maximumBytes = 64 * 1024;
export async function POST(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") return reply({error:"JSON required"},415);
  const reader = request.body?.getReader();
  if (!reader) return reply({error:"Invalid usage event"},400);
  let input: unknown;
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); return reply({error:"Usage event too large"},413); }
      chunks.push(chunk.value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return reply({error:"Invalid usage event"},400); }
  finally { reader.releaseLock(); }
  // Service authentication is independent of browser cookies or workspace selection.
  // Always authenticate before opening a database connection.
  let authority;
  try { authority = resolveUsageAuthority(input); }
  catch { return reply({error:"Usage authentication denied"},401); }
  const databaseUrl = process.env.DATABASE_USAGE_INGEST_URL;
  if (!databaseUrl) return reply({error:"Usage ingestion unavailable"},503);
  try {
    const result = await storeSignedUsage(databaseUrl,input,authority);
    return reply(result,result.duplicate ? 200 : result.disposition === "quarantined" ? 202 : 201);
  } catch (error) {
    if (error instanceof Error && error.message === "Usage idempotency conflict") return reply({error:"Usage idempotency conflict"},409);
    if (error instanceof InvalidUsageTeamAttributionError) return reply({error:"Usage team attribution invalid"},422);
    return reply({error:"Usage ingestion unavailable"},503);
  }
}
