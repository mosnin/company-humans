import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCanonicalId } from "@company-human/contracts";
import { aggregateUsage } from "@company-human/database/usage-aggregation";
import { resolveAccessContext } from "@company-human/database/rls";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { GET } from "./route";
vi.mock("@company-human/database/usage-aggregation", () => ({ aggregateUsage: vi.fn() }));
vi.mock("@company-human/database/rls", () => ({ resolveAccessContext: vi.fn() }));
vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
const org = createCanonicalId("organization"), user = createCanonicalId("user");
const context = { params: Promise.resolve({ organizationId: org }) };
const original = process.env.DATABASE_RUNTIME_URL;
const query = { environment: "production", from: "2026-01-01T00:00:00Z", until: "2026-02-01T00:00:00Z", breakdown: "product" };
const request = (params: Record<string, string> = query) => new NextRequest(`https://human.test/api/organizations/${org}/usage?${new URLSearchParams(params)}`);
beforeEach(() => {
  process.env.DATABASE_RUNTIME_URL = "postgresql://restricted-fixture";
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: user });
  vi.mocked(resolveAccessContext).mockResolvedValue({ capabilities: ["usage.read.own"] } as never);
  vi.mocked(aggregateUsage).mockResolvedValue([]);
});
afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_RUNTIME_URL; else process.env.DATABASE_RUNTIME_URL = original;
  vi.resetAllMocks();
});
it("binds authenticated identity, exact window and canonical filters to the restricted reader", async () => {
  const filters = { productInstanceId: createCanonicalId("productInstance"), membershipId: createCanonicalId("membership"), teamId: createCanonicalId("team") };
  const result = await GET(request({ ...query, ...filters }), context);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ scope: "permitted-usage", window: { ...query, ...filters }, usage: [] });
  expect(resolveAccessContext).toHaveBeenCalledWith("postgresql://restricted-fixture", user, org);
  expect(aggregateUsage).toHaveBeenCalledWith("postgresql://restricted-fixture", user, { organizationId: org, ...query, ...filters });
});
it.each([["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const)("rejects %s without querying usage", async (status, code) => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status });
  const result = await GET(request(), context);
  expect(result.status).toBe(code); expect(result.headers.get("cache-control")).toBe("no-store");
  expect(resolveAccessContext).not.toHaveBeenCalled(); expect(aggregateUsage).not.toHaveBeenCalled();
});
it.each([
  { ...query, actorUserId: user }, { ...query, environment: "all" }, { ...query, breakdown: "raw" },
  { ...query, from: "2026-01-01T00:00:00.123456789Z" }, { ...query, from: "2026-01-01" }, { ...query, from: "2026-02-30T00:00:00Z" },
  { ...query, until: query.from }, { ...query, from: query.until, until: query.from },
  { ...query, membershipId: "not-canonical" }, { ...query, teamId: "" },
  { environment: "test", from: query.from, until: query.until },
])("rejects malformed or unsupported query %#", async (params) => {
  const result = await GET(request(params), context);
  expect(result.status).toBe(400); expect(result.headers.get("cache-control")).toBe("no-store"); expect(aggregateUsage).not.toHaveBeenCalled();
});
it("rejects duplicate query keys and invalid organizations", async () => {
  const req = request(); req.nextUrl.searchParams.append("environment", "test");
  expect((await GET(req, context)).status).toBe(400);
  expect((await GET(request(), { params: Promise.resolve({ organizationId: "wrong" }) })).status).toBe(400);
  expect(aggregateUsage).not.toHaveBeenCalled();
});
it.each([null, { capabilities: [] }])("denies inaccessible organizations or absent usage permission", async access => {
  vi.mocked(resolveAccessContext).mockResolvedValue(access as never);
  const result = await GET(request(), context);
  expect(result.status).toBe(403); expect(result.headers.get("cache-control")).toBe("no-store"); expect(aggregateUsage).not.toHaveBeenCalled();
});
it("redacts database errors and does not fall back to privileged credentials", async () => {
  vi.mocked(aggregateUsage).mockRejectedValue(new Error("postgres password source provider cost"));
  const response = await GET(request(), context);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("password"); expect(response.headers.get("cache-control")).toBe("no-store");
  delete process.env.DATABASE_RUNTIME_URL; vi.mocked(aggregateUsage).mockClear();
  expect((await GET(request(), context)).status).toBe(503); expect(aggregateUsage).not.toHaveBeenCalled();
});
