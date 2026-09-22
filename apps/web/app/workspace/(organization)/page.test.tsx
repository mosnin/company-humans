import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ workspace: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getWorkspace: mocks.workspace }));
import Page from "./page";
beforeEach(() => vi.clearAllMocks());
const workspace = (capabilities: string[]) => mocks.workspace.mockResolvedValue({ organization: { name: "Example team" }, context: { capabilities } });
it("gives contributors a next action without exposing people administration", async () => {
  workspace(["usage.read.own"]);
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain('href="/workspace/apps"'); expect(html).toContain('href="/workspace/usage"'); expect(html).not.toContain('href="/workspace/people"');
});
it("hides usage when the role has no usage permission", async () => {
  workspace([]); const html = renderToStaticMarkup(await Page()); expect(html).toContain('href="/workspace/apps"'); expect(html).not.toContain('href="/workspace/usage"');
});
it("offers people management to an authorized administrator", async () => {
  workspace(["members.manage", "usage.read.all"]); const html = renderToStaticMarkup(await Page()); expect(html).toContain('href="/workspace/people"'); expect(html).toContain('href="/workspace/apps"');
});
it("shows no workspace content before workspace resolution", async () => { mocks.workspace.mockResolvedValue(null); expect(await Page()).toBeNull(); });
