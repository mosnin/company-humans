import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "./page";
import { getWorkspace } from "@/lib/workspace";
import { listApplicationMemberDiagnostics } from "@company-human/database/administration";

vi.mock("@/lib/workspace", () => ({ getWorkspace: vi.fn() }));
vi.mock("@company-human/database/administration", () => ({ listApplicationMemberDiagnostics: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

const instanceId = `ch_inst_${"a".repeat(32)}`;
const mappingId = `ch_pmem_${"b".repeat(32)}`;
const params = { params: Promise.resolve({ instanceId }), searchParams: Promise.resolve({}) };

function setup(capabilities: string[]) {
  vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture");
  vi.mocked(getWorkspace).mockResolvedValue({ context: {
    userId: `ch_usr_${"c".repeat(32)}`, organizationId: `ch_org_${"d".repeat(32)}`, capabilities,
  } } as never);
  vi.mocked(listApplicationMemberDiagnostics).mockResolvedValue({ productName: "Scalar", total: 1, page: 1,
    members: [{ id: mappingId, membershipId: `ch_mem_${"e".repeat(32)}`, memberName: "Member",
      membershipStatus: "active", desiredEnabled: true, denial: null }] } as never);
}

it("hides the readiness link from an applications-only administrator", async () => {
  setup(["applications.manage"]);
  const html = renderToStaticMarkup(await Page(params));
  expect(html).toContain("Scalar members");
  expect(html).not.toContain("Activation readiness");
});

it("shows the readiness link only when both required permissions are present", async () => {
  setup(["applications.manage", "budgets.manage"]);
  const html = renderToStaticMarkup(await Page(params));
  expect(html).toContain(`/workspace/applications/${instanceId}/members/${mappingId}/readiness`);
});
