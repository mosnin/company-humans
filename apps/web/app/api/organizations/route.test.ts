import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/organizations", () => ({ createOrganization: vi.fn() }));

const originalDatabaseUrl = process.env.DATABASE_URL;
const url = "http://localhost/api/organizations";

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  vi.resetAllMocks();
});

function request(body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("organization creation boundary", () => {
  it("requires an authenticated canonical user before creating a tenant", async () => {
    process.env.DATABASE_URL = "postgresql://local-test";
    const { resolveAuthenticatedUser } = await import("@/lib/authenticated-user");
    const { createOrganization } = await import("@company-human/database/organizations");
    vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "unauthenticated" });
    expect((await POST(request({ name: "Acme", slug: "acme" }))).status).toBe(401);
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("rejects an invalid tenant name before the database call", async () => {
    process.env.DATABASE_URL = "postgresql://local-test";
    const { resolveAuthenticatedUser } = await import("@/lib/authenticated-user");
    const { createOrganization } = await import("@company-human/database/organizations");
    vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: "ch_usr_00000000000000000000000000000001" as never });
    expect((await POST(request({ name: "Acme", slug: "Invalid Slug" }))).status).toBe(400);
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("binds the new tenant owner to the authenticated user", async () => {
    process.env.DATABASE_URL = "postgresql://local-test";
    const { resolveAuthenticatedUser } = await import("@/lib/authenticated-user");
    const { createOrganization } = await import("@company-human/database/organizations");
    const userId = "ch_usr_00000000000000000000000000000001" as never;
    vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId });
    vi.mocked(createOrganization).mockResolvedValue({
      organizationId: "ch_org_00000000000000000000000000000001" as never,
      ownerMembershipId: "ch_mem_00000000000000000000000000000001" as never,
    });
    const response = await POST(request({ name: "Acme", slug: "acme", ownerUserId: "another-user" }));
    expect(response.status).toBe(201);
    expect(createOrganization).toHaveBeenCalledWith("postgresql://local-test", { ownerUserId: userId, name: "Acme", slug: "acme" });
  });
});
