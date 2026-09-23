import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { setProductUsageLimit, UsageLimitConflict } from "@company-human/database/product-usage-limits";
vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/product-usage-limits", () => ({ setProductUsageLimit: vi.fn(), UsageLimitConflict: class extends Error {} }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const org = `ch_org_${"a".repeat(32)}`, instance = `ch_inst_${"a".repeat(32)}`, member = `ch_mem_${"b".repeat(32)}`;
const user = `ch_usr_${"a".repeat(32)}` as never;
const context = { params: Promise.resolve({ organizationId: org, instanceId: instance }) };
const body = { membershipId: null, meterKey: "enriched-leads", unit: "lead", window: "utc_month", maximumQuantity: "0", expectedRevision: 0 };
const request = (value: unknown = body, origin: string | null = "https://human.example.test") => new NextRequest(`https://human.example.test/api/organizations/${org}/applications/${instance}/usage-limits`, {
  method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(value),
});
function authenticated() {
  vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture");
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: user });
}
it.each([null, member])("binds trusted identity/scope for member %s and never claims enforcement", async membershipId => {
  authenticated();
  const revision = { schemaVersion: 1, usageLimitId: `ch_lim_${"c".repeat(32)}`, organizationId: org, productInstanceId: instance, ...body, membershipId, revision: 1 };
  vi.mocked(setProductUsageLimit).mockResolvedValue(revision as never);
  const response = await POST(request({ ...body, membershipId }), context);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ revision, providerEnforcementConfirmed: false });
  expect(setProductUsageLimit).toHaveBeenCalledWith("postgresql://fixture", { ...body, membershipId, actorUserId: user, organizationId: org, productInstanceId: instance });
});
it("preserves exact fractional quantities and canonicalizes trailing zeroes", async () => {
  authenticated(); vi.mocked(setProductUsageLimit).mockResolvedValue({ revision: 1 } as never);
  for (const [input, expected] of [["999999999999.999999", "999999999999.999999"], ["0.000001", "0.000001"], ["2.500000", "2.5"]]) {
    expect((await POST(request({ ...body, maximumQuantity: input }), context)).status).toBe(200);
    expect(setProductUsageLimit).toHaveBeenLastCalledWith("postgresql://fixture", expect.objectContaining({ maximumQuantity: expected }));
  }
});
it.each([null, "null", "https://foreign.example.test", "https://human.example.test.attacker.test", "http://human.example.test", "https://human.example.test:444"])("rejects origin %s before authentication", async origin => {
  expect((await POST(request(body, origin), context)).status).toBe(403);
  expect(resolveAuthenticatedUser).not.toHaveBeenCalled(); expect(setProductUsageLimit).not.toHaveBeenCalled();
});
it.each([["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const)("denies %s", async (status, code) => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status });
  expect((await POST(request(), context)).status).toBe(code); expect(setProductUsageLimit).not.toHaveBeenCalled();
});
it.each([
  { ...body, actorUserId: user }, { ...body, organizationId: org }, { ...body, productInstanceId: instance },
  { ...body, expectedRevision: -1 }, { ...body, expectedRevision: 2147483647 }, { ...body, membershipId: org },
  { ...body, maximumQuantity: 1 }, { ...body, maximumQuantity: "-1" }, { ...body, maximumQuantity: "Infinity" },
  { ...body, maximumQuantity: "0.0000001" }, { ...body, maximumQuantity: "unlimited" }, { ...body, window: "rolling" },
  { ...body, meterKey: "" }, { ...body, unit: "" }, null,
])("rejects invalid settings %j", async value => {
  authenticated(); expect((await POST(request(value), context)).status).toBe(400); expect(setProductUsageLimit).not.toHaveBeenCalled();
});
it("rejects malformed JSON without mutation", async () => {
  authenticated(); const req = request(); vi.spyOn(req, "json").mockRejectedValue(new SyntaxError("private parse detail"));
  expect((await POST(req, context)).status).toBe(400); expect(setProductUsageLimit).not.toHaveBeenCalled();
});
it.each([{ organizationId: "bad", instanceId: instance }, { organizationId: org, instanceId: "bad" }])("rejects malformed scope %j", async params => {
  authenticated(); expect((await POST(request(), { params: Promise.resolve(params) })).status).toBe(400); expect(setProductUsageLimit).not.toHaveBeenCalled();
});
it("returns conflict for stale revisions", async () => {
  authenticated(); vi.mocked(setProductUsageLimit).mockRejectedValue(new UsageLimitConflict());
  expect((await POST(request(), context)).status).toBe(409);
});
it.each([["Budget administration denied", 403], ["Membership unavailable", 403], ["Product instance unavailable", 403], ["Meter unavailable", 422], ["Usage limit unit is immutable", 422], ["Usage limit unit is immutable across scopes", 422], ["private database secret", 503]] as const)("normalizes %s", async (message, code) => {
  authenticated(); vi.mocked(setProductUsageLimit).mockRejectedValue(new Error(message));
  const response = await POST(request(), context); expect(response.status).toBe(code); expect(await response.text()).not.toContain("private database secret");
});
it("fails closed without a configured database", async () => {
  authenticated(); vi.stubEnv("DATABASE_SERVICE_URL", "");
  expect((await POST(request(), context)).status).toBe(503); expect(setProductUsageLimit).not.toHaveBeenCalled();
});
it("fails closed on identity errors without exposing provider detail", async () => {
  vi.mocked(resolveAuthenticatedUser).mockRejectedValue(new Error("private identity detail"));
  const response = await POST(request(), context); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private identity detail"); expect(setProductUsageLimit).not.toHaveBeenCalled();
});
