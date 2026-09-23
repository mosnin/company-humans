import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCanonicalId } from "@company-human/contracts";
import { completeHumanAssignment, HumanWorkConflict, HumanWorkDenied } from "@company-human/database/human-work";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { POST } from "./route";

vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/human-work", () => ({
  completeHumanAssignment: vi.fn(), HumanWorkConflict: class extends Error {}, HumanWorkDenied: class extends Error {},
}));

const organizationId = createCanonicalId("organization");
const assignmentId = createCanonicalId("humanAssignment");
const actorUserId = createCanonicalId("user");
const context = { params: Promise.resolve({ organizationId, assignmentId }) };
const body = { outcome: "Qualified and requested a proposal", evidence: "Call notes saved" };
const url = `https://human.example.test/api/organizations/${organizationId}/work/${assignmentId}/complete`;
const request = (value: unknown = body, origin: string | null = "https://human.example.test") => new NextRequest(url,
  { method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(value) });

beforeEach(() => { vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture"); vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId: actorUserId }); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it("records a contributor reported completion without claiming verified outcome", async () => {
  vi.mocked(completeHumanAssignment).mockResolvedValue({ id: assignmentId } as never);
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "reported_complete" });
  expect(completeHumanAssignment).toHaveBeenCalledWith("postgresql://fixture", { ...body, actorUserId, organizationId, assignmentId });
});

it.each([null, "https://foreign.example.test"])("rejects origin %s before identity", async origin => {
  expect((await POST(request(body, origin), context)).status).toBe(403);
  expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
});

it.each([["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const)("denies %s", async (status, code) => {
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status });
  expect((await POST(request(), context)).status).toBe(code);
  expect(completeHumanAssignment).not.toHaveBeenCalled();
});

it.each([null, { ...body, actorUserId }, { ...body, organizationId }, { ...body, evidence: "" }, { ...body, outcome: "" }])("rejects invalid or forged body %#", async value => {
  expect((await POST(request(value), context)).status).toBe(400);
  expect(completeHumanAssignment).not.toHaveBeenCalled();
});

it("redacts scope and duplicate failures", async () => {
  expect((await POST(request(), { params: Promise.resolve({ organizationId, assignmentId: "bad" }) })).status).toBe(400);
  vi.mocked(completeHumanAssignment).mockRejectedValueOnce(new HumanWorkConflict());
  expect((await POST(request(), context)).status).toBe(409);
  vi.mocked(completeHumanAssignment).mockRejectedValueOnce(new HumanWorkDenied());
  expect((await POST(request(), context)).status).toBe(403);
  vi.mocked(completeHumanAssignment).mockRejectedValueOnce(new Error("private database detail"));
  const failure = await POST(request(), context);
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain("private database detail");
});
