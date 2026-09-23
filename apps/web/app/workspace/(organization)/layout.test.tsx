import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { createCanonicalId } from "@company-human/contracts";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), modules: vi.fn(), shell: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@company-human/database/workspace-modules", () => ({ readWorkspaceModules: mocks.modules }));
vi.mock("@/components/shell/workspace-shell", () => ({ WorkspaceShell: (props: { children: ReactNode; workEnabled: boolean }) => { mocks.shell(props); return <div>{props.children}</div>; } }));
import Layout from "./layout";

const userId = createCanonicalId("user");
const organizationId = createCanonicalId("organization");
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_RUNTIME_URL", "postgresql://runtime");
  mocks.workspace.mockResolvedValue({ context: { userId, organizationId, capabilities: ["assignments.read.own"] }, organization: { name: "Example" } });
  mocks.modules.mockResolvedValue([{ moduleKey: "work", enabled: true, revision: 0 }]);
});
afterEach(() => vi.unstubAllEnvs());

it("derives Work navigation visibility from the selected member's organization", async () => {
  renderToStaticMarkup(await Layout({ children: <p>Child</p> }));
  expect(mocks.modules).toHaveBeenCalledWith("postgresql://runtime", { actorUserId: userId, organizationId });
  expect(mocks.shell).toHaveBeenCalledWith(expect.objectContaining({ workEnabled: true }));
});

it("fails closed when module configuration is unavailable", async () => {
  mocks.modules.mockRejectedValue(new Error("private database detail"));
  const html = renderToStaticMarkup(await Layout({ children: <p>Child</p> }));
  expect(mocks.shell).toHaveBeenCalledWith(expect.objectContaining({ workEnabled: false }));
  expect(html).not.toContain("private database detail");
});
