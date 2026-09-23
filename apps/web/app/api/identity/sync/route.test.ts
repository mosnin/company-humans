import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), sync: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/provider-identity", () => ({ readProviderIdentity: mocks.identity }));
vi.mock("@company-human/database/auth-users", () => ({ syncAuthUser: mocks.sync, findCanonicalUser: mocks.find }));
import { POST } from "./route";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("DATABASE_IDENTITY_URL","test-only"); });
afterEach(() => vi.unstubAllEnvs());
const request = (origin = "https://human.example.test") => new NextRequest("https://human.example.test/api/identity/sync", { method:"POST",headers:{origin},body:JSON.stringify({subject:"forged",email:"forged@example.test"}) });
it("rejects cross-origin identity creation", async () => {
  expect((await POST(request("https://attacker.example.test"))).status).toBe(403);
  expect(mocks.identity).not.toHaveBeenCalled();
});
it("uses verified backend identity, ignoring client-supplied identity fields", async () => {
  mocks.identity.mockResolvedValue({status:"ok",issuer:"https://auth.example.test",profile:{subject:"real",name:"Person",verifiedEmail:"real@example.test",updatedAt:1000}});
  mocks.find.mockResolvedValue("canonical");
  expect((await POST(request())).status).toBe(200);
  expect(mocks.sync).toHaveBeenCalledWith("test-only",{authIssuer:"https://auth.example.test",authSubject:"real",primaryEmail:"real@example.test",displayName:"Person",status:"active",eventTimestamp:1000});
});
it("cannot reactivate a canonical deleted user", async () => {
  mocks.identity.mockResolvedValue({status:"ok",issuer:"https://auth.example.test",profile:{subject:"deleted",name:"Person",verifiedEmail:null,updatedAt:1000}});
  mocks.find.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(403);
});
it("does not create a user without a verified session", async () => {
  mocks.identity.mockResolvedValue({status:"unauthenticated"});
  expect((await POST(request())).status).toBe(401);expect(mocks.sync).not.toHaveBeenCalled();
});
