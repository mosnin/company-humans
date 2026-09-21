import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { setProductEntitlement, EntitlementConflict } from "@company-human/database/product-entitlements";
vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/product-entitlements", () => ({ setProductEntitlement: vi.fn(), EntitlementConflict: class extends Error {} }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const org = `ch_org_${"a".repeat(32)}`;
const user = `ch_usr_${"a".repeat(32)}` as never;
const instance = `ch_inst_${"a".repeat(32)}`;
const context = { params: Promise.resolve({ organizationId: org, instanceId: instance }) };
const body = { membershipId: null, capability: "lead-enrichment", effect: "deny", expectedRevision: 0 };
const request = (value: unknown = body, origin: string | null = "https://human.example.test") => new NextRequest(`https://human.example.test/api/organizations/${org}/applications/${instance}/entitlements`, {
  method: "POST", headers: { ...(origin ? {origin} : {}), "content-type": "application/json" }, body: JSON.stringify(value),
});
function authenticated() {
  vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture");
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: user });
}
it("binds actor and scope on the server and returns configuration without claiming access", async () => {
  authenticated();
  vi.mocked(setProductEntitlement).mockResolvedValue({revision:1} as never);
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({revision:{revision:1},providerAccessConfirmed:false});
  expect(setProductEntitlement).toHaveBeenCalledWith("postgresql://fixture", {...body,actorUserId:user,organizationId:org,productInstanceId:instance});
});
it.each([null, "https://foreign.example.test"])("rejects origin %s before identity", async origin => {
  expect((await POST(request(body,origin),context)).status).toBe(403);
  expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
  expect(setProductEntitlement).not.toHaveBeenCalled();
});
it.each([["unauthenticated",401],["forbidden",403],["unavailable",503]] as const)("denies %s", async (status,code) => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({status});
  expect((await POST(request(),context)).status).toBe(code);
  expect(setProductEntitlement).not.toHaveBeenCalled();
});
it.each([{...body,actorUserId:user},{...body,organizationId:org},{...body,expectedRevision:-1},{...body,effect:"active"},{...body,membershipId:org},null])("rejects invalid body %j", async value => {
  authenticated();
  expect((await POST(request(value),context)).status).toBe(400);
  expect(setProductEntitlement).not.toHaveBeenCalled();
});
it("rejects malformed application identity", async () => {
  authenticated();
  expect((await POST(request(),{params:Promise.resolve({organizationId:org,instanceId:"bad"})})).status).toBe(400);
  expect(setProductEntitlement).not.toHaveBeenCalled();
});
it("returns conflict for stale edits", async () => {
  authenticated();vi.mocked(setProductEntitlement).mockRejectedValue(new EntitlementConflict());
  expect((await POST(request(),context)).status).toBe(409);
});
it.each([["Application administration denied",403],["Membership unavailable",403],["Product instance unavailable",403],["Capability unavailable",422],["private database secret",503]] as const)("handles %s without leaking internal errors",async (message,code)=>{
  authenticated();vi.mocked(setProductEntitlement).mockRejectedValue(new Error(message));
  const response=await POST(request(),context);expect(response.status).toBe(code);
  expect(await response.text()).not.toContain("private database secret");
});
it("fails closed when identity resolution throws", async () => {
  vi.mocked(resolveAuthenticatedUser).mockRejectedValue(new Error("private identity detail"));
  const response=await POST(request(),context);expect(response.status).toBe(503);
  expect(setProductEntitlement).not.toHaveBeenCalled();
});
