import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: mocks.identity }));
vi.mock("@company-human/database/role-permissions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@company-human/database/role-permissions")>(), setRolePermissions: mocks.update,
}));
import { PUT } from "./route";
import { RolePermissionError } from "@company-human/database/role-permissions";
const userId = `ch_usr_${"a".repeat(32)}`;
const organizationId = `ch_org_${"b".repeat(32)}`;
const roleId = `ch_role_${"c".repeat(32)}`;
const context = { params: Promise.resolve({ organizationId, roleId }) };
function request(body: unknown) { return new NextRequest("http://localhost/api/permissions", { method: "PUT", headers: { origin: "http://localhost" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("DATABASE_SERVICE_URL", "test-only"); mocks.identity.mockResolvedValue({ status: "ok", userId }); });
describe("role policy boundary", () => {
  it("rejects unauthenticated changes before reaching the database", async () => {
    mocks.identity.mockResolvedValue({ status: "unauthenticated" });
    expect((await PUT(request({}), context)).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("binds actor and tenant to authentication and route parameters", async () => {
    expect((await PUT(request({ actorUserId: "spoofed", organizationId: "spoofed", capabilities: [], expectedCapabilities: [] }), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("test-only", { actorUserId: userId, organizationId, roleId, capabilities: [], expectedCapabilities: [] });
  });
  it("reports a stale edit as a conflict", async () => {
    mocks.update.mockRejectedValue(new RolePermissionError("conflict"));
    expect((await PUT(request({ capabilities: [], expectedCapabilities: [] }), context)).status).toBe(409);
  });
});
