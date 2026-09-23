import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), find: vi.fn() }));
vi.mock("./provider-identity", () => ({ readProviderIdentity: mocks.identity }));
vi.mock("@company-human/database/auth-users", () => ({ findCanonicalUser: mocks.find }));
import { resolveAuthenticatedUser } from "./authenticated-user";
const id = `ch_usr_${"a".repeat(32)}`;
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("DATABASE_IDENTITY_URL", "test-only"); mocks.find.mockResolvedValue(id); });
afterEach(() => vi.unstubAllEnvs());
describe("Convex canonical identity boundary", () => {
  it("does not use cached canonical email as proof of ownership", async () => {
    mocks.identity.mockResolvedValue({status:"ok",issuer:"https://auth.example.test",profile:{subject:"convex123",verifiedEmail:null}});
    expect(await resolveAuthenticatedUser({requireVerifiedEmail:true})).toEqual({status:"forbidden"});
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("maps the verified provider subject and issuer, never email", async () => {
    mocks.identity.mockResolvedValue({status:"ok",issuer:"https://auth.example.test",profile:{subject:"convex123",verifiedEmail:"person@example.test"}});
    expect(await resolveAuthenticatedUser({requireVerifiedEmail:true})).toEqual({status:"ok",userId:id,verifiedEmail:"person@example.test"});
    expect(mocks.find).toHaveBeenCalledWith("test-only","https://auth.example.test","convex123");
  });
  it("denies a revoked session even when a canonical user exists", async () => {
    mocks.identity.mockResolvedValue({status:"unauthenticated"});
    expect(await resolveAuthenticatedUser()).toEqual({status:"unauthenticated"});
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("preserves a canonical deletion tombstone", async () => {
    mocks.identity.mockResolvedValue({status:"ok",issuer:"https://auth.example.test",profile:{subject:"convex123",verifiedEmail:null}});
    mocks.find.mockResolvedValue(null);
    expect(await resolveAuthenticatedUser()).toEqual({status:"forbidden"});
  });
});
