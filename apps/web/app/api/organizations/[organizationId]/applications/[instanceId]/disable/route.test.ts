import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { disableProductInstance } from "@company-human/database/product-instances";
vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/product-instances", () => ({ disableProductInstance: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const org = `ch_org_${"a".repeat(32)}`;
const user = `ch_usr_${"a".repeat(32)}` as never;
const instance = `ch_inst_${"a".repeat(32)}`;
const context = { params: Promise.resolve({ organizationId: org, instanceId: instance }) };
const request = () => new NextRequest(`https://human.example.test/api/organizations/${org}/applications/${instance}/disable`, {
  method: "POST", headers: { origin: "https://human.example.test", "content-type": "application/json" },
  body: JSON.stringify({ actorUserId: "forged", organizationId: "forged", desiredEnabled: true }),
});
it("uses server identity and URL scope, acknowledging only local denial", async () => {
  vi.stubEnv("DATABASE_SERVICE_URL","postgresql://fixture");
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: user });
  vi.mocked(disableProductInstance).mockResolvedValue(undefined);
  const response=await POST(request(),context);
  expect(response.status).toBe(202);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({desiredEnabled:false,remoteRevocationConfirmed:false});
  expect(disableProductInstance).toHaveBeenCalledWith("postgresql://fixture",{actorUserId:user,organizationId:org,productInstanceId:instance});
});
it.each([["unauthenticated",401],["forbidden",403],["unavailable",503]] as const)("denies %s without database access", async (status,code) => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({status});
  expect((await POST(request(),context)).status).toBe(code);
  expect(disableProductInstance).not.toHaveBeenCalled();
});
it("rejects malformed identifiers before database access", async () => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({status:"ok",userId:user});
  expect((await POST(request(),{params:Promise.resolve({organizationId:org,instanceId:"invalid"})})).status).toBe(400);
  expect(disableProductInstance).not.toHaveBeenCalled();
});
it.each([["Application administration denied",403],["Product instance unavailable",403],["secret provider/database detail",503]] as const)("handles failure without claiming disablement: %s", async (message,code) => {
  vi.stubEnv("DATABASE_SERVICE_URL","postgresql://fixture");
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({status:"ok",userId:user});
  vi.mocked(disableProductInstance).mockRejectedValue(new Error(message));
  const response=await POST(request(),context);
  expect(response.status).toBe(code);
  expect(await response.json()).toEqual({error:code===403?"Application unavailable or permission denied":"Could not disable application. Please retry."});
});
