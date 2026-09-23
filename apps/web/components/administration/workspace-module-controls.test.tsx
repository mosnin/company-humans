import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceModuleSetting } from "@company-human/database/workspace-modules";
import { saveWorkModule, WorkspaceModuleControls, WorkspaceModuleSaveConflict } from "./workspace-module-controls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

const organizationId = "ch_org_example";
const settings: WorkspaceModuleSetting[] = [
  { moduleKey: "work", enabled: true, revision: 4 },
  { moduleKey: "crm", enabled: true, revision: 1 },
  { moduleKey: "referrals", enabled: false, revision: 0 },
  { moduleKey: "earnings", enabled: false, revision: 0 },
  { moduleKey: "leaderboard", enabled: false, revision: 0 },
  { moduleKey: "team", enabled: false, revision: 0 },
  { moduleKey: "context", enabled: false, revision: 0 },
  { moduleKey: "creator", enabled: false, revision: 0 },
];

it("shows the eight native modules, an actionable Work control, and the exact Work-off effect", () => {
  const html = renderToStaticMarkup(<WorkspaceModuleControls organizationId={organizationId} settings={settings} />);
  for (const name of ["Human Work", "CRM", "Referrals", "Earnings", "Leaderboard", "Team", "Context", "Creator or UGC"]) {
    expect(html).toContain(name);
  }
  expect(html).toContain("Turn Work off");
  expect(html).toContain("aria-pressed=\"true\"");
  expect(html).toContain("hides the Work queue and stops assignment creation and completion");
  expect(html).toContain("Existing assignment history is preserved");
  expect(html).toContain("Connected applications and their access are managed separately");
});

it("keeps all seven unfinished experiences disabled even when a stored request is on", () => {
  const html = renderToStaticMarkup(<WorkspaceModuleControls organizationId={organizationId} settings={settings} />);
  expect(html.match(/controls are not available yet/g)).toHaveLength(7);
  expect(html).toContain("Requested setting: On. The workspace experience is not available yet.");
  expect(html).toContain("disabled=\"\" aria-label=\"CRM controls are not available yet\"");
});

it("sends Work revision compare-and-swap and accepts only its matching receipt", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ setting: { moduleKey: "work", enabled: false, revision: 5 } }) });
  vi.stubGlobal("fetch", fetch);
  await expect(saveWorkModule(organizationId, false, 4)).resolves.toEqual({ moduleKey: "work", enabled: false, revision: 5 });
  expect(fetch).toHaveBeenCalledWith(`/api/organizations/${organizationId}/modules/work`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: false, expectedRevision: 4 }),
  });
});

it("requires reload on conflict or an unconfirmed response and reports other errors", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "stale" }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ setting: { moduleKey: "work", enabled: true, revision: 5 } }) })
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Service unavailable" }) });
  vi.stubGlobal("fetch", fetch);
  await expect(saveWorkModule(organizationId, false, 4)).rejects.toBeInstanceOf(WorkspaceModuleSaveConflict);
  await expect(saveWorkModule(organizationId, false, 4)).rejects.toThrow("could not be confirmed");
  await expect(saveWorkModule(organizationId, false, 4)).rejects.toThrow("Service unavailable");
});
