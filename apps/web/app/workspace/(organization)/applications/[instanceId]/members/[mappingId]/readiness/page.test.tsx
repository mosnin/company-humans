import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "./page";
import { getWorkspace } from "@/lib/workspace";
import { inspectMemberActivationReadiness } from "@company-human/database/member-activation-readiness";
import type { ActivationReadiness } from "@company-human/database/member-activation-readiness";

vi.mock("@/lib/workspace", () => ({ getWorkspace: vi.fn() }));
vi.mock("@company-human/database/member-activation-readiness", () => ({ inspectMemberActivationReadiness: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

const org = `ch_org_${"a".repeat(32)}`;
const user = `ch_usr_${"b".repeat(32)}`;
const instance = `ch_inst_${"c".repeat(32)}`;
const mapping = `ch_pmem_${"d".repeat(32)}`;
const member = `ch_mem_${"e".repeat(32)}`;
const request = { params: Promise.resolve({ instanceId: instance, mappingId: mapping }) };
const diagnostic = {
  ready: false, reasons: ["limit_readback_missing", "meter_semantics_unverified"],
  subject: { membershipId: member, productInstanceId: instance },
  evidence: { capabilityRevision: 3, checkedLimitCount: 2, declaredMeterCount: 1 },
} satisfies ActivationReadiness;
function workspace(capabilities = ["applications.manage", "budgets.manage"]) {
  vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture");
  vi.mocked(getWorkspace).mockResolvedValue({ context: { userId: user, organizationId: org, capabilities } } as never);
}
const render = async () => renderToStaticMarkup(await Page(request));

it("does not read tenant data without an authenticated workspace", async () => {
  vi.mocked(getWorkspace).mockResolvedValue(null);
  expect(await Page(request)).toBeNull();
  expect(inspectMemberActivationReadiness).not.toHaveBeenCalled();
});
it.each([{ capabilities: [] }, { capabilities: ["applications.manage"] }, { capabilities: ["budgets.manage"] }])("requires both permissions before the database call: $capabilities", async ({ capabilities }) => {
  workspace(capabilities);
  expect(await render()).toContain("Activation readiness restricted");
  expect(inspectMemberActivationReadiness).not.toHaveBeenCalled();
});
it("uses the selected organization and route instance, shows reasons and only administrative links", async () => {
  workspace(); vi.mocked(inspectMemberActivationReadiness).mockResolvedValue(diagnostic);
  const html = await render();
  expect(inspectMemberActivationReadiness).toHaveBeenCalledWith("postgresql://fixture", {
    actorUserId: user, organizationId: org, productMembershipId: mapping, expectedProductInstanceId: instance,
  });
  expect(html).toContain("Activation remains blocked");
  expect(html).toContain("Usage limit delivery unverified");
  expect(html).toContain("Meter enforcement unverified");
  expect(html).toContain(`/workspace/applications/${instance}/entitlements?member=${member}`);
  expect(html).toContain(`/workspace/applications/${instance}/usage-limits?member=${member}`);
  expect(html).toContain(`/workspace/applications/${instance}/health`);
  expect(html).not.toContain("Launch");
  expect(html).not.toContain("Activate member");
});
it("hides mismatched mappings and does not leak underlying errors", async () => {
  workspace(); vi.mocked(inspectMemberActivationReadiness).mockResolvedValue({ ...diagnostic, subject: { ...diagnostic.subject, productInstanceId: `ch_inst_${"f".repeat(32)}` } });
  expect(await render()).toContain("Activation readiness unavailable");
  vi.mocked(inspectMemberActivationReadiness).mockRejectedValue(new Error("private database detail"));
  const html = await render();
  expect(html).toContain("Activation readiness unavailable");
  expect(html).not.toContain("private database detail");
});
it("fails closed without a database service configuration", async () => {
  workspace(); vi.stubEnv("DATABASE_SERVICE_URL", "");
  expect(await render()).toContain("Activation readiness unavailable");
  expect(inspectMemberActivationReadiness).not.toHaveBeenCalled();
});
