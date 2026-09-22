import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCanonicalId } from "@company-human/contracts";
import { releaseQuarantinedUsage } from "@company-human/database/usage-quarantine";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { POST } from "./route";
vi.mock("@company-human/database/usage-quarantine", () => ({ releaseQuarantinedUsage: vi.fn() }));
vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
const org = createCanonicalId("organization"), user = createCanonicalId("user"), event = createCanonicalId("event");
const context = { params: Promise.resolve({ organizationId: org, eventId: event }) };
const original = process.env.DATABASE_SERVICE_URL;
const request = (body: unknown = { reason: " Meter registered " }, origin: string | null = "https://human.test") => new NextRequest(`https://human.test/api/organizations/${org}/usage/${event}/release`, { method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  process.env.DATABASE_SERVICE_URL = "postgresql://restricted-service-fixture";
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: user });
  vi.mocked(releaseQuarantinedUsage).mockResolvedValue({ released: true });
});
afterEach(() => { if (original === undefined) delete process.env.DATABASE_SERVICE_URL; else process.env.DATABASE_SERVICE_URL = original; vi.resetAllMocks(); });
it.each(["https://foreign.test", null])("denies missing or foreign origin before identity and database access", async origin => {
  const result = await POST(request(undefined, origin), context);
  expect(result.status).toBe(403); expect(result.headers.get("cache-control")).toBe("no-store"); expect(resolveAuthenticatedUser).not.toHaveBeenCalled(); expect(releaseQuarantinedUsage).not.toHaveBeenCalled();
});
it.each([true, false])("binds verified actor and preserves idempotent release result %s", async released => {
  vi.mocked(releaseQuarantinedUsage).mockResolvedValue({ released });
  const result = await POST(request(), context);
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store"); expect(await result.json()).toEqual({ released });
  expect(releaseQuarantinedUsage).toHaveBeenCalledWith("postgresql://restricted-service-fixture", { organizationId: org, eventId: event, actorUserId: user, reason: "Meter registered" });
});
it.each([["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const)("denies %s identity", async (status, code) => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status });
  const result = await POST(request(), context); expect(result.status).toBe(code); expect(result.headers.get("cache-control")).toBe("no-store"); expect(releaseQuarantinedUsage).not.toHaveBeenCalled();
});
it.each([{}, { reason: " " }, { reason: "a".repeat(1001) }, { reason: 3 }, { reason: "valid", actorUserId: user }, { reason: "valid", organizationId: org }, null])("rejects invalid and authority-forging bodies %#", async body => {
  const result = await POST(request(body), context); expect(result.status).toBe(400); expect(result.headers.get("cache-control")).toBe("no-store"); expect(releaseQuarantinedUsage).not.toHaveBeenCalled();
});
it("rejects noncanonical identifiers and broken JSON", async () => {
  expect((await POST(request(), { params: Promise.resolve({ organizationId: "bad", eventId: event }) })).status).toBe(400);
  expect((await POST(request(), { params: Promise.resolve({ organizationId: org, eventId: "bad" }) })).status).toBe(400);
  const req = new NextRequest("https://human.test/release", { method: "POST", headers: { origin: "https://human.test" }, body: "{" });
  expect((await POST(req, context)).status).toBe(400); expect(releaseQuarantinedUsage).not.toHaveBeenCalled();
});
it.each([["Usage recovery unavailable or denied", 403], ["Usage is not quarantined", 409], ["Exact meter registration required", 409], ["private database credential", 503]] as const)("normalizes release error %s", async (message, code) => {
  vi.mocked(releaseQuarantinedUsage).mockRejectedValue(new Error(message)); const result = await POST(request(), context);
  expect(result.status).toBe(code); expect(result.headers.get("cache-control")).toBe("no-store"); expect(await result.text()).not.toContain("private database credential");
});
it("fails closed without the service connection", async () => {
  delete process.env.DATABASE_SERVICE_URL;
  const result = await POST(request(), context); expect(result.status).toBe(503); expect(result.headers.get("cache-control")).toBe("no-store"); expect(releaseQuarantinedUsage).not.toHaveBeenCalled();
});
