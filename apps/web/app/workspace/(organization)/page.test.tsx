import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createCanonicalId } from "@company-human/contracts";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), modules: vi.fn(), work: vi.fn(), apps: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@company-human/database/workspace-modules", () => ({ readWorkspaceModules: mocks.modules }));
vi.mock("@company-human/database/human-work", () => ({ listHumanAssignments: mocks.work }));
vi.mock("@company-human/database/rls", () => ({ listMemberApplications: mocks.apps }));
import Page from "./page";

const userId = createCanonicalId("user");
const organizationId = createCanonicalId("organization");
const workspace = (capabilities: string[]) => mocks.workspace.mockResolvedValue({
  organization: { name: "Example team" }, context: { userId, organizationId, capabilities },
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_RUNTIME_URL", "postgresql://runtime");
  workspace(["assignments.read.own", "usage.read.own"]);
  mocks.modules.mockResolvedValue([{ moduleKey: "work", enabled: true, revision: 0 }]);
  mocks.work.mockResolvedValue({ items: [], nextOffset: null });
  mocks.apps.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

it("shows the contributor's actual next actions and only their own database scope", async () => {
  mocks.work.mockResolvedValue({ items: [{ id: createCanonicalId("humanAssignment"), title: "Call the lead", dueAt: "2026-09-23T15:00:00.000Z", completion: null }], nextOffset: null });
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("What needs your attention");
  expect(html).toContain("Call the lead");
  expect(html).toContain('href="/workspace/work"');
  expect(html).toContain('href="/workspace/apps"');
  expect(html).toContain('href="/workspace/usage"');
  expect(html).not.toContain('href="/workspace/people"');
  expect(mocks.modules).toHaveBeenCalledWith("postgresql://runtime", { actorUserId: userId, organizationId });
  expect(mocks.work).toHaveBeenCalledWith("postgresql://runtime", { actorUserId: userId, organizationId, scope: "own", pageSize: 3 });
  expect(mocks.apps).toHaveBeenCalledWith("postgresql://runtime", userId, organizationId);
});

it("keeps disabled Work off Home and does not query its assignments", async () => {
  mocks.modules.mockResolvedValue([{ moduleKey: "work", enabled: false, revision: 1 }]);
  const html = renderToStaticMarkup(await Page());
  expect(html).not.toContain("What needs your attention");
  expect(mocks.work).not.toHaveBeenCalled();
});

it("reports a failed module check instead of implying Work is disabled", async () => {
  mocks.modules.mockRejectedValueOnce(new Error("private database detail"));
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("Work status could not be checked");
  expect(html).not.toContain("private database detail");
  expect(mocks.work).not.toHaveBeenCalled();
});

it("does not reveal a Work card to a role without own-assignment permission", async () => {
  workspace(["usage.read.own"]);
  const html = renderToStaticMarkup(await Page());
  expect(html).not.toContain("What needs your attention");
  expect(mocks.modules).not.toHaveBeenCalled();
  expect(mocks.work).not.toHaveBeenCalled();
});

it("distinguishes empty assignments from a failed query", async () => {
  expect(renderToStaticMarkup(await Page())).toContain("No open assignments are due right now.");
  mocks.work.mockRejectedValueOnce(new Error("private database detail"));
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("assignments could not be loaded");
  expect(html).not.toContain("private database detail");
});

it("does not count a removed mapping as an assigned launchable app", async () => {
  // The current reader maps removed memberships to unavailable and keeps the
  // historical row, so Home must avoid an assigned-app count.
  mocks.apps.mockResolvedValue([{ id: "removed-mapping", name: "Scalar", status: "unavailable" }]);
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("App access can be setting up, paused, or unavailable");
  expect(html).not.toContain("assigned app");
  expect(html).not.toContain("Launch Scalar");
});

it("hides usage without permission and shows people management to an admin", async () => {
  workspace(["members.manage", "assignments.read.own"]);
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain('href="/workspace/people"');
  expect(html).not.toContain('href="/workspace/usage"');
});

it("shows no workspace content before workspace resolution", async () => {
  mocks.workspace.mockResolvedValue(null);
  expect(await Page()).toBeNull();
  expect(mocks.modules).not.toHaveBeenCalled();
  expect(mocks.work).not.toHaveBeenCalled();
  expect(mocks.apps).not.toHaveBeenCalled();
});
