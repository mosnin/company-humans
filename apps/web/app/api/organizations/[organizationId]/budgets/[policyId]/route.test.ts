import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCanonicalId } from "@company-human/contracts";
import {
  BudgetPolicyConflict, BudgetPolicyDenied, BudgetPolicyInvalid, reviseBudgetPolicy,
} from "@company-human/database/budget-policies";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { PATCH } from "./route";

vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/budget-policies", () => ({
  reviseBudgetPolicy: vi.fn(), BudgetPolicyConflict: class extends Error {},
  BudgetPolicyDenied: class extends Error {}, BudgetPolicyInvalid: class extends Error {},
}));

const organizationId = createCanonicalId("organization");
const policyId = createCanonicalId("budget");
const userId = createCanonicalId("user");
const context = { params: Promise.resolve({ organizationId, policyId }) };
const body = { expectedRevision: 1, maximumQuantity: "20", action: "warning", status: "disabled" };
const url = `https://human.example.test/api/organizations/${organizationId}/budgets/${policyId}`;
const request = (value: unknown = body, origin: string | null = "https://human.example.test") =>
  new NextRequest(url, {
    method: "PATCH", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(value),
  });

beforeEach(() => {
  vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture");
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("binds revision to authenticated identity and path while reporting no provider enforcement", async () => {
  const policy = { policyId, revision: 2, ...body, maximumQuantity: "2.5" };
  vi.mocked(reviseBudgetPolicy).mockResolvedValue(policy as never);
  const response = await PATCH(request({ ...body, maximumQuantity: "2.500000" }), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ policy, providerEnforcementConfirmed: false });
  expect(reviseBudgetPolicy).toHaveBeenCalledWith("postgresql://fixture", {
    ...body, maximumQuantity: "2.5", actorUserId: userId, organizationId, policyId,
  });
});

it.each([null, "null", "https://foreign.test", "https://human.example.test.attacker.test", "http://human.example.test"])(
  "rejects PATCH origin %s before identity", async origin => {
    const response = await PATCH(request(body, origin), context);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
    expect(reviseBudgetPolicy).not.toHaveBeenCalled();
  },
);

it.each([["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const)(
  "denies %s", async (status, code) => {
    vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status });
    const response = await PATCH(request(), context);
    expect(response.status).toBe(code);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(reviseBudgetPolicy).not.toHaveBeenCalled();
  },
);

it.each([
  { ...body, actorUserId: userId }, { ...body, organizationId }, { ...body, policyId },
  { ...body, productId: createCanonicalId("product") }, { ...body, expectedRevision: 0 },
  { ...body, expectedRevision: -1 }, { ...body, expectedRevision: 2147483647 },
  { ...body, expectedRevision: 1.5 }, { ...body, maximumQuantity: "unlimited" },
  { ...body, maximumQuantity: "0.0000001" }, { ...body, maximumQuantity: 1 },
  { ...body, action: "unlimited" }, { ...body, status: "archived" }, null,
])("rejects malformed PATCH body %#", async value => {
  const response = await PATCH(request(value), context);
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(reviseBudgetPolicy).not.toHaveBeenCalled();
});

it("rejects malformed JSON and path identities before mutation", async () => {
  const malformed = request();
  vi.spyOn(malformed, "json").mockRejectedValue(new SyntaxError("private parse detail"));
  expect((await PATCH(malformed, context)).status).toBe(400);
  expect((await PATCH(request(), { params: Promise.resolve({ organizationId: "invalid", policyId }) })).status).toBe(400);
  expect((await PATCH(request(), { params: Promise.resolve({ organizationId, policyId: "invalid" }) })).status).toBe(400);
  expect(reviseBudgetPolicy).not.toHaveBeenCalled();
});

it.each([
  [BudgetPolicyConflict, 409], [BudgetPolicyDenied, 403], [BudgetPolicyInvalid, 422], [Error, 503],
] as const)("redacts database failures", async (Failure, status) => {
  const failure = new Failure();
  failure.message = "private database credential";
  vi.mocked(reviseBudgetPolicy).mockRejectedValue(failure);
  const response = await PATCH(request(), context);
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toContain("private database credential");
});

it("fails closed when database or identity is unavailable", async () => {
  vi.stubEnv("DATABASE_SERVICE_URL", "");
  expect((await PATCH(request(), context)).status).toBe(503);
  expect(reviseBudgetPolicy).not.toHaveBeenCalled();
  vi.mocked(resolveAuthenticatedUser).mockRejectedValue(new Error("private identity credential"));
  expect(await (await PATCH(request(), context)).text()).not.toContain("private identity credential");
});
