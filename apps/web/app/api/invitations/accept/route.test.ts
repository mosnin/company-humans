import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/membership-lifecycle", () => ({ acceptInvitation: vi.fn() }));

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  vi.resetAllMocks();
});

describe("invitation acceptance boundary", () => {
  it("does not redeem a token before canonical authentication", async () => {
    process.env.DATABASE_URL = "postgresql://local-test";
    const { resolveAuthenticatedUser } = await import("@/lib/authenticated-user");
    const { acceptInvitation } = await import("@company-human/database/membership-lifecycle");
    vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "unauthenticated" });
    const request = new NextRequest("http://localhost/api/invitations/accept", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "secret" }),
    });
    expect((await POST(request)).status).toBe(401);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });
});
