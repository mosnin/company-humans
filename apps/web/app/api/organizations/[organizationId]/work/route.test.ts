import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCanonicalId } from "@company-human/contracts";
import { createHumanAssignment, HumanWorkDenied } from "@company-human/database/human-work";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { POST } from "./route";

vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/human-work", () => ({
  createHumanAssignment: vi.fn(), HumanWorkDenied: class extends Error {},
}));

const organizationId = createCanonicalId("organization");
const actorUserId = createCanonicalId("user");
const assigneeMembershipId = createCanonicalId("membership");
const assignmentId = createCanonicalId("humanAssignment");
const context = { params: Promise.resolve({ organizationId }) };
const body = { assigneeMembershipId, teamId: null, title: "Call the lead", objective: "Confirm their need", dueAt: null, priority: "normal", expectedOutcome: "Qualified conversation", evidenceRequired: true };
const url = `https://human.example.test/api/organizations/${organizationId}/work`;
const request = (value: unknown = body, origin: string | null = "https://human.example.test") => new NextRequest(url,
  { method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(value) });

beforeEach(() => { vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture"); vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: actorUserId }); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it("creates a manager assigned obligation with the authenticated actor", async () => {
  vi.mocked(createHumanAssignment).mockResolvedValue({ id: assignmentId } as never);
  const response = await POST(request(), context);
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ assignmentId });
  expect(createHumanAssignment).toHaveBeenCalledWith("postgresql://fixture", { ...body, actorUserId, organizationId });
});

it.each([null, "https://foreign.example.test"])("rejects origin %s before identity", async origin => {
  expect((await POST(request(body, origin), context)).status).toBe(403);
  expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
});

it.each([["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const)("denies %s", async (status, code) => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status });
  expect((await POST(request(), context)).status).toBe(code);
  expect(createHumanAssignment).not.toHaveBeenCalled();
});

it.each([null, { ...body, actorUserId }, { ...body, organizationId }, { ...body, source: "workflow" }, { ...body, assigneeMembershipId: organizationId }, { ...body, title: "" }])("rejects invalid or forged body %#", async value => {
  expect((await POST(request(value), context)).status).toBe(400);
  expect(createHumanAssignment).not.toHaveBeenCalled();
});

it("denies foreign scope and redacts database errors", async () => {
  expect((await POST(request(), { params: Promise.resolve({ organizationId: "bad" }) })).status).toBe(400);
  vi.mocked(createHumanAssignment).mockRejectedValueOnce(new HumanWorkDenied());
  expect((await POST(request(), context)).status).toBe(403);
  vi.mocked(createHumanAssignment).mockRejectedValueOnce(new Error("private database detail"));
  const failure = await POST(request(), context);
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain("private database detail");
});
