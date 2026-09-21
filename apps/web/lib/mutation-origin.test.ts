import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const identity = vi.hoisted(() => ({ canonical: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: identity.canonical }));
vi.mock("@/lib/provider-identity", () => ({ readProviderIdentity: identity.provider }));
import { POST as handler0 } from "@/app/api/identity/sync/route";
import { POST as handler1 } from "@/app/api/invitations/accept/route";
import { POST as handler2 } from "@/app/api/organizations/[organizationId]/applications/route";
import { POST as handler3 } from "@/app/api/organizations/[organizationId]/invitations/route";
import { PATCH as handler4 } from "@/app/api/organizations/[organizationId]/memberships/[membershipId]/role/route";
import { PATCH as handler5 } from "@/app/api/organizations/[organizationId]/memberships/[membershipId]/route";
import { PUT as handler6 } from "@/app/api/organizations/[organizationId]/roles/[roleId]/permissions/route";
import { PATCH as handler7 } from "@/app/api/organizations/[organizationId]/route";
import { PUT as handler8 } from "@/app/api/organizations/[organizationId]/teams/[teamId]/members/route";
import { POST as handler9 } from "@/app/api/organizations/[organizationId]/teams/route";
import { POST as handler10 } from "@/app/api/organizations/route";
import { POST as handler11 } from "@/app/api/organizations/switch/route";
import { DELETE as handler12 } from "@/app/api/organizations/[organizationId]/invitations/[invitationId]/route";
const context = { params: Promise.resolve({ invitationId: `ch_inv_${"a".repeat(32)}`, organizationId: `ch_org_${"a".repeat(32)}`, membershipId: `ch_mem_${"a".repeat(32)}`, roleId: `ch_role_${"a".repeat(32)}`, teamId: `ch_team_${"a".repeat(32)}` }) };
const handlers = [
  ["invitation revoke", "DELETE", (request: NextRequest) => handler12(request, context)],
  ["app/api/identity/sync/route", "POST", (request: NextRequest) => handler0(request)],
  ["app/api/invitations/accept/route", "POST", (request: NextRequest) => handler1(request)],
  ["app/api/organizations/[organizationId]/applications/route", "POST", (request: NextRequest) => handler2(request, context)],
  ["app/api/organizations/[organizationId]/invitations/route", "POST", (request: NextRequest) => handler3(request, context)],
  ["app/api/organizations/[organizationId]/memberships/[membershipId]/role/route", "PATCH", (request: NextRequest) => handler4(request, context)],
  ["app/api/organizations/[organizationId]/memberships/[membershipId]/route", "PATCH", (request: NextRequest) => handler5(request, context)],
  ["app/api/organizations/[organizationId]/roles/[roleId]/permissions/route", "PUT", (request: NextRequest) => handler6(request, context)],
  ["app/api/organizations/[organizationId]/route", "PATCH", (request: NextRequest) => handler7(request, context)],
  ["app/api/organizations/[organizationId]/teams/[teamId]/members/route", "PUT", (request: NextRequest) => handler8(request, context)],
  ["app/api/organizations/[organizationId]/teams/route", "POST", (request: NextRequest) => handler9(request, context)],
  ["app/api/organizations/route", "POST", (request: NextRequest) => handler10(request)],
  ["app/api/organizations/switch/route", "POST", (request: NextRequest) => handler11(request)],
] as const;
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("DATABASE_IDENTITY_URL", "test-only"); identity.canonical.mockResolvedValue({ status: "unauthenticated" }); identity.provider.mockResolvedValue({ status: "unauthenticated" }); });
afterEach(() => vi.unstubAllEnvs());
it.each(handlers)("%s rejects untrusted origins before authentication and permits same-origin authentication checks", async (_path, method, handler) => {
  for (const origin of [undefined, "null", "https://attacker.example.test", "https://human.example.test.attacker.test", "http://human.example.test", "https://human.example.test:444"]) {
    const response = await handler(new NextRequest("https://human.example.test/api/mutation", { method,
      headers: { ...(origin ? { origin } : {}), "content-type": "text/plain", cookie: "fixture_session=present" }, body: "{}" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(identity.canonical).not.toHaveBeenCalled();
    expect(identity.provider).not.toHaveBeenCalled();
  }
  const response = await handler(new NextRequest("https://human.example.test/api/mutation", { method,
    headers: { origin: "https://human.example.test", "content-type": "application/json" }, body: "{}" }));
  expect(response.status).toBe(401);
  expect(identity.canonical.mock.calls.length + identity.provider.mock.calls.length).toBe(1);
});

it("uses the destination Host through Next proxy normalization, not forwarded host overrides", async () => {
  const { rejectCrossOriginMutation } = await import("./mutation-origin");
  const request = (origin: string) => new NextRequest("https://localhost/api/mutation", { method: "POST",
    headers: { host: "human.example.test", origin, "x-forwarded-host": "attacker.example.test" } });
  expect(rejectCrossOriginMutation(request("https://human.example.test"))).toBeNull();
  expect(rejectCrossOriginMutation(request("https://attacker.example.test"))?.status).toBe(403);
  expect(rejectCrossOriginMutation(request("https://localhost"))?.status).toBe(403);
});
