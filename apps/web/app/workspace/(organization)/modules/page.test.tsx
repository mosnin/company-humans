import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createCanonicalId } from "@company-human/contracts";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), modules: vi.fn(), controls: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@company-human/database/workspace-modules", () => ({ readWorkspaceModules: mocks.modules }));
vi.mock("@/components/administration/workspace-module-controls", () => ({
  WorkspaceModuleControls: (props: unknown) => { mocks.controls(props); return <div>Module controls</div>; },
}));
import Page from "./page";

const userId = createCanonicalId("user");
const organizationId = createCanonicalId("organization");
const settings = [{ moduleKey: "work", enabled: true, revision: 0 }];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_RUNTIME_URL", "postgresql://runtime");
  mocks.workspace.mockResolvedValue({ context: { userId, organizationId, capabilities: ["organization.manage"] }, organization: { name: "Example" } });
  mocks.modules.mockResolvedValue(settings);
});
afterEach(() => vi.unstubAllEnvs());

it("reads tenant modules under the member role and renders organization controls", async () => {
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("Module controls");
  expect(mocks.modules).toHaveBeenCalledWith("postgresql://runtime", { actorUserId: userId, organizationId });
  expect(mocks.controls).toHaveBeenCalledWith({ organizationId, settings });
});

it("does not query module state for a contributor", async () => {
  mocks.workspace.mockResolvedValue({ context: { userId, organizationId, capabilities: ["assignments.read.own"] }, organization: { name: "Example" } });
  expect(renderToStaticMarkup(await Page())).toContain("Workspace settings restricted");
  expect(mocks.modules).not.toHaveBeenCalled();
});

it("fails closed on missing workspace or module state", async () => {
  mocks.workspace.mockResolvedValueOnce(null);
  expect(await Page()).toBeNull();
  mocks.modules.mockRejectedValueOnce(new Error("private database detail"));
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("Workspace settings unavailable");
  expect(html).not.toContain("private database detail");
});
