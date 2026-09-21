import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { enableProductInstance } from "@company-human/database/product-instances";
vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/product-instances", () => ({ enableProductInstance: vi.fn(), listProductInstances: vi.fn() }));
const previous = process.env.DATABASE_SERVICE_URL;
afterEach(() => { if (previous === undefined) delete process.env.DATABASE_SERVICE_URL; else process.env.DATABASE_SERVICE_URL = previous; vi.resetAllMocks(); });
const org = `ch_org_${"a".repeat(32)}`;
const user = `ch_usr_${"a".repeat(32)}` as never;
const instance = `ch_inst_${"a".repeat(32)}` as never;
const context = { params: Promise.resolve({ organizationId: org }) };
const request = (origin: string) => new NextRequest(`https://human.example.test/api/organizations/${org}/applications`, {
  method: "POST", headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ productId: `ch_prod_${"a".repeat(32)}`, mode: "provisioned", actorUserId: "forged" }),
});
it("rejects cross-origin enablement before authentication or database calls", async () => {
  expect((await POST(request("https://untrusted.example.test"), context)).status).toBe(403);
  expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
  expect(enableProductInstance).not.toHaveBeenCalled();
});
it("binds the actor and acknowledges intent without inventing the existing instance status", async () => {
  process.env.DATABASE_SERVICE_URL = "postgresql://fixture";
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: user });
  vi.mocked(enableProductInstance).mockResolvedValue(instance);
  const response = await POST(request("https://human.example.test"), context);
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ instanceId: instance });
  expect(enableProductInstance).toHaveBeenCalledWith("postgresql://fixture", expect.objectContaining({ actorUserId: user, organizationId: org }));
  expect(response.headers.get("cache-control")).toBe("no-store");
});
