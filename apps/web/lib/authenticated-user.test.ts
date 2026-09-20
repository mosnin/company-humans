import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), find: vi.fn(), sync: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@company-human/database/clerk-users", () => ({ findCanonicalUser: mocks.find, syncClerkUser: mocks.sync }));
import { resolveAuthenticatedUser } from "./authenticated-user";
const id = `ch_usr_${"a".repeat(32)}`;
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["DATABASE_IDENTITY_URL","CLERK_SECRET_KEY","NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]) vi.stubEnv(key,"test-only");
  mocks.auth.mockResolvedValue({userId:"user_Test"});mocks.find.mockResolvedValue(id);
});
afterEach(() => vi.unstubAllEnvs());
describe("fresh invitation identity", () => {
  it("does not use a cached canonical email as proof of ownership", async () => {
    mocks.currentUser.mockResolvedValue({id:"user_Test",primaryEmailAddressId:"email_1",emailAddresses:[{id:"email_1",emailAddress:"person@example.test",verification:{status:"unverified"}}]});
    expect(await resolveAuthenticatedUser({requireVerifiedEmail:true})).toEqual({status:"forbidden"});
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("refreshes verified provider identity before invitation acceptance", async () => {
    mocks.currentUser.mockResolvedValue({id:"user_Test",firstName:"Person",updatedAt:1000,primaryEmailAddressId:"email_1",emailAddresses:[{id:"email_1",emailAddress:"person@example.test",verification:{status:"verified"}}]});
    expect(await resolveAuthenticatedUser({requireVerifiedEmail:true})).toEqual({status:"ok",userId:id,verifiedEmail:"person@example.test"});
    expect(mocks.sync).toHaveBeenCalledWith("test-only",expect.objectContaining({primaryEmail:"person@example.test",eventTimestamp:1000}));
  });
});
