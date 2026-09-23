import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createCanonicalId } from "@company-human/contracts";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), modules: vi.fn(), assignments: vi.fn(), candidates: vi.fn(), board: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@company-human/database/workspace-modules", () => ({ readWorkspaceModules: mocks.modules }));
vi.mock("@company-human/database/human-work", () => ({ listHumanAssignments: mocks.assignments, listAssignableMembers: mocks.candidates }));
vi.mock("@/components/work/work-board", () => ({ WorkBoard: (props: unknown) => { mocks.board(props); return <div>Work board</div>; } }));
import Page from "./page";

const organizationId = createCanonicalId("organization");
const userId = createCanonicalId("user");
const context = { userId, organizationId, capabilities: ["assignments.read.own"] };
const params = (view?: string, offset?: string) => Promise.resolve({ view, offset });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_RUNTIME_URL", "postgresql://runtime");
  vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://service");
  mocks.workspace.mockResolvedValue({ context, organization: { name: "Example" } });
  mocks.modules.mockResolvedValue([{ moduleKey: "work", enabled: true, revision: 0 }]);
  mocks.assignments.mockResolvedValue({ items: [], nextOffset: null });
  mocks.candidates.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

it("reads only the selected contributor's assignments with the runtime role", async () => {
  const html = renderToStaticMarkup(await Page({ searchParams: params() }));
  expect(html).toContain("Work board");
  expect(mocks.modules).toHaveBeenCalledWith("postgresql://runtime", { actorUserId: userId, organizationId });
  expect(mocks.assignments).toHaveBeenCalledWith("postgresql://runtime", { actorUserId: userId, organizationId, scope: "own", offset: 0, pageSize: 50 });
  expect(mocks.candidates).not.toHaveBeenCalled();
});

it("denies disabled Work before assignment reads", async () => {
  mocks.modules.mockResolvedValue([{ moduleKey: "work", enabled: false, revision: 1 }]);
  const html = renderToStaticMarkup(await Page({ searchParams: params() }));
  expect(html).toContain("Work is turned off");
  expect(mocks.assignments).not.toHaveBeenCalled();
});

it("denies missing workspace or assignment permission before module reads", async () => {
  mocks.workspace.mockResolvedValueOnce(null);
  expect(await Page({ searchParams: params() })).toBeNull();
  mocks.workspace.mockResolvedValueOnce({ context: { ...context, capabilities: [] }, organization: { name: "Example" } });
  expect(renderToStaticMarkup(await Page({ searchParams: params() }))).toContain("Work access restricted");
  expect(mocks.modules).not.toHaveBeenCalled();
});

it("uses the service role only for a manager's authorized team view", async () => {
  mocks.workspace.mockResolvedValue({ context: { ...context, capabilities: ["assignments.read.own", "assignments.read.team", "assignments.manage.team"] }, organization: { name: "Example" } });
  expect(renderToStaticMarkup(await Page({ searchParams: params("team") }))).toContain("Work board");
  expect(mocks.assignments).toHaveBeenCalledWith("postgresql://service", { actorUserId: userId, organizationId, scope: "team", offset: 0, pageSize: 50 });
  expect(mocks.candidates).toHaveBeenCalledWith("postgresql://service", { actorUserId: userId, organizationId, teamId: null });
});

it.each([
  ["team manager without team read", ["assignments.read.own", "assignments.manage.team"]],
  ["all manager without all read", ["assignments.read.own", "assignments.read.team", "assignments.manage.all"]],
  ["all manager with team grants but without all read", ["assignments.read.own", "assignments.read.team", "assignments.manage.team", "assignments.manage.all"]],
] as const)("keeps %s on their own queue instead of exposing a dead Team work view", async (_label, capabilities) => {
  mocks.workspace.mockResolvedValue({ context: { ...context, capabilities }, organization: { name: "Example" } });
  expect(renderToStaticMarkup(await Page({ searchParams: params("team") }))).toContain("Work board");
  expect(mocks.assignments).toHaveBeenCalledWith("postgresql://runtime", {
    actorUserId: userId, organizationId, scope: "own", offset: 0, pageSize: 50,
  });
  expect(mocks.candidates).not.toHaveBeenCalled();
  expect(mocks.board).toHaveBeenCalledWith(expect.objectContaining({ view: "mine", canManage: false }));
});

it("uses the all-scope service reader only with paired all-scope grants", async () => {
  mocks.workspace.mockResolvedValue({ context: { ...context, capabilities: ["assignments.read.own", "assignments.read.all", "assignments.manage.all"] }, organization: { name: "Example" } });
  expect(renderToStaticMarkup(await Page({ searchParams: params("team") }))).toContain("Work board");
  expect(mocks.assignments).toHaveBeenCalledWith("postgresql://service", {
    actorUserId: userId, organizationId, scope: "all", offset: 0, pageSize: 50,
  });
  expect(mocks.board).toHaveBeenCalledWith(expect.objectContaining({ view: "team", canManage: true }));
});

it("does not turn database failure into an empty work queue or leak details", async () => {
  mocks.assignments.mockRejectedValue(new Error("private database detail"));
  const html = renderToStaticMarkup(await Page({ searchParams: params() }));
  expect(html).toContain("Work unavailable");
  expect(html).not.toContain("private database detail");
  expect(mocks.board).not.toHaveBeenCalled();
});
