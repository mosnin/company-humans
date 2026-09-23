import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCanonicalId } from "@company-human/contracts";
import { setWorkspaceModule, WorkspaceModuleConflict, WorkspaceModuleDenied } from "@company-human/database/workspace-modules";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { PUT } from "./route";

vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/workspace-modules", async importOriginal => ({
  ...(await importOriginal<typeof import("@company-human/database/workspace-modules")>()),
  setWorkspaceModule: vi.fn(),
}));

const organizationId = createCanonicalId("organization");
const actorUserId = createCanonicalId("user");
const context = (moduleKey: string = "work", org: string = organizationId) => ({ params: Promise.resolve({ organizationId: org, moduleKey }) });
const body = { enabled: false, expectedRevision: 2 };
const url = `https://human.example.test/api/organizations/${organizationId}/modules/work`;
const request = (value: unknown = body, origin: string | null = "https://human.example.test") => new NextRequest(url,
  { method: "PUT", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(value) });

beforeEach(() => {
  vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture");
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: actorUserId });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it("appends the Work revision through the actor-bound service boundary", async () => {
  const setting = { moduleKey: "work" as const, enabled: false, revision: 3 };
  vi.mocked(setWorkspaceModule).mockResolvedValue(setting);
  const response = await PUT(request(), context());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ setting });
  expect(setWorkspaceModule).toHaveBeenCalledWith("postgresql://fixture", {
    actorUserId, organizationId, moduleKey: "work", ...body,
  });
});

it.each([null, "https://foreign.example.test"])("rejects origin %s before identity", async origin => {
  expect((await PUT(request(body, origin), context())).status).toBe(403);
  expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
});

it.each([["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const)("denies %s", async (status, code) => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status });
  expect((await PUT(request(), context())).status).toBe(code);
  expect(setWorkspaceModule).not.toHaveBeenCalled();
});

it.each([null, { enabled: true }, { ...body, expectedRevision: -1 }, { ...body, actorUserId }, { ...body, moduleKey: "crm" }])
  ("rejects invalid or forged body %#", async value => {
    expect((await PUT(request(value), context())).status).toBe(400);
    expect(setWorkspaceModule).not.toHaveBeenCalled();
  });

it("rejects invalid scope and unavailable native modules", async () => {
  expect((await PUT(request(), context("work", "bad"))).status).toBe(400);
  expect((await PUT(request(), context("unlisted"))).status).toBe(400);
  expect((await PUT(request(), context("crm"))).status).toBe(422);
  expect(setWorkspaceModule).not.toHaveBeenCalled();
});

it("returns conflict, tenant denial and redacted infrastructure failure", async () => {
  vi.mocked(setWorkspaceModule).mockRejectedValueOnce(new WorkspaceModuleConflict());
  expect((await PUT(request(), context())).status).toBe(409);
  vi.mocked(setWorkspaceModule).mockRejectedValueOnce(new WorkspaceModuleDenied());
  expect((await PUT(request(), context())).status).toBe(403);
  vi.mocked(setWorkspaceModule).mockRejectedValueOnce(new Error("private database detail"));
  const failure = await PUT(request(), context());
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain("private database detail");
});
