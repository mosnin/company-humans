import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCanonicalId } from "@company-human/contracts";
import {
  BudgetPolicyDenied, BudgetPolicyInvalid, createBudgetPolicy, readBudgetPolicies,
} from "@company-human/database/budget-policies";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { GET, POST } from "./route";

vi.mock("@/lib/authenticated-user", () => ({ resolveAuthenticatedUser: vi.fn() }));
vi.mock("@company-human/database/budget-policies", () => ({
  readBudgetPolicies: vi.fn(), createBudgetPolicy: vi.fn(),
  BudgetPolicyDenied: class extends Error {}, BudgetPolicyInvalid: class extends Error {},
}));

const organizationId = createCanonicalId("organization");
const productId = createCanonicalId("product");
const userId = createCanonicalId("user");
const context = { params: Promise.resolve({ organizationId }) };
const meter = { meterKey: "enriched-leads", meterVersion: 2, unit: "lead" };
const body = {
  productId, meter, window: "utc_month", scope: { kind: "organization" },
  maximumQuantity: "10", action: "hard_stop", status: "active",
};
const baseUrl = `https://human.example.test/api/organizations/${organizationId}/budgets`;
const getRequest = (query = `productId=${productId}&meterKey=enriched-leads&meterVersion=2&unit=lead`) =>
  new NextRequest(`${baseUrl}?${query}`);
const postRequest = (value: unknown = body, origin: string | null = "https://human.example.test") =>
  new NextRequest(baseUrl, {
    method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(value),
  });

beforeEach(() => {
  vi.stubEnv("DATABASE_SERVICE_URL", "postgresql://fixture");
  vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status: "ok", userId });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("binds GET to authenticated identity and the exact tenant, product and meter", async () => {
  const policies = [{ ...body, policyId: createCanonicalId("budget"), revision: 1 }];
  vi.mocked(readBudgetPolicies).mockResolvedValue(policies as never);
  const response = await GET(getRequest(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ policies, providerEnforcementConfirmed: false });
  expect(readBudgetPolicies).toHaveBeenCalledWith("postgresql://fixture", {
    actorUserId: userId, organizationId, productId, meter,
  });
});

it("binds POST to authenticated identity and reports no provider enforcement", async () => {
  const policy = { ...body, policyId: createCanonicalId("budget"), revision: 1, maximumQuantity: "2.5" };
  vi.mocked(createBudgetPolicy).mockResolvedValue(policy as never);
  const response = await POST(postRequest({ ...body, maximumQuantity: "2.500000" }), context);
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ policy, providerEnforcementConfirmed: false });
  expect(createBudgetPolicy).toHaveBeenCalledWith("postgresql://fixture", {
    ...body, maximumQuantity: "2.5", actorUserId: userId, organizationId,
  });
});

it.each([null, "null", "https://foreign.test", "https://human.example.test.attacker.test", "http://human.example.test"])(
  "rejects POST origin %s before identity", async origin => {
    const response = await POST(postRequest(body, origin), context);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
    expect(createBudgetPolicy).not.toHaveBeenCalled();
  },
);

it.each([["unauthenticated", 401], ["forbidden", 403], ["unavailable", 503]] as const)(
  "denies %s for GET and POST", async (status, code) => {
    vi.mocked(resolveAuthenticatedUser).mockResolvedValue({ status });
    for (const response of [await GET(getRequest(), context), await POST(postRequest(), context)]) {
      expect(response.status).toBe(code);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(readBudgetPolicies).not.toHaveBeenCalled();
    expect(createBudgetPolicy).not.toHaveBeenCalled();
  },
);

it.each([
  `productId=${productId}&meterKey=enriched-leads&meterVersion=2&unit=lead&actorUserId=${userId}`,
  `productId=${productId}&meterKey=enriched-leads&meterVersion=2&unit=lead&productId=${productId}`,
  `productId=${productId}&meterKey=enriched-leads&meterVersion=0&unit=lead`,
  `productId=${productId}&meterKey=enriched-leads&meterVersion=02&unit=lead`,
  `productId=${productId}&meterKey=enriched-leads&meterVersion=1e2&unit=lead`,
  `productId=${organizationId}&meterKey=enriched-leads&meterVersion=2&unit=lead`,
  `productId=${productId}&meterKey=enriched-leads&meterVersion=2`,
])("rejects malformed GET query %s", async query => {
  const response = await GET(getRequest(query), context);
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(readBudgetPolicies).not.toHaveBeenCalled();
});

it.each([
  { ...body, actorUserId: userId }, { ...body, organizationId }, { ...body, policyId: createCanonicalId("budget") },
  { ...body, meter: { ...meter, status: "active" } }, { ...body, productId: organizationId },
  { ...body, scope: { kind: "team", teamId: organizationId } },
  { ...body, status: "archived" }, { ...body, action: "unlimited" },
  { ...body, maximumQuantity: "unlimited" }, { ...body, maximumQuantity: "-1" },
  { ...body, maximumQuantity: 1 }, { ...body, window: "rolling_week" }, null,
])("rejects malformed POST body %#", async value => {
  const response = await POST(postRequest(value), context);
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(createBudgetPolicy).not.toHaveBeenCalled();
});

it("rejects malformed JSON and path identities before database access", async () => {
  const malformed = postRequest();
  vi.spyOn(malformed, "json").mockRejectedValue(new SyntaxError("private parse detail"));
  expect((await POST(malformed, context)).status).toBe(400);
  expect((await POST(postRequest(), { params: Promise.resolve({ organizationId: "invalid" }) })).status).toBe(400);
  expect((await GET(getRequest(), { params: Promise.resolve({ organizationId: "invalid" }) })).status).toBe(400);
  expect(createBudgetPolicy).not.toHaveBeenCalled();
  expect(readBudgetPolicies).not.toHaveBeenCalled();
});

it.each([
  [BudgetPolicyDenied, 403], [BudgetPolicyInvalid, 422], [Error, 503],
] as const)("redacts database failures for GET and POST", async (Failure, status) => {
  const failure = new Failure();
  failure.message = "private database credential";
  vi.mocked(readBudgetPolicies).mockRejectedValue(failure);
  vi.mocked(createBudgetPolicy).mockRejectedValue(failure);
  for (const response of [await GET(getRequest(), context), await POST(postRequest(), context)]) {
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("private database credential");
  }
});

it("fails closed when database or identity is unavailable", async () => {
  vi.stubEnv("DATABASE_SERVICE_URL", "");
  expect((await GET(getRequest(), context)).status).toBe(503);
  expect((await POST(postRequest(), context)).status).toBe(503);
  expect(readBudgetPolicies).not.toHaveBeenCalled();
  expect(createBudgetPolicy).not.toHaveBeenCalled();
  vi.mocked(resolveAuthenticatedUser).mockRejectedValue(new Error("private identity credential"));
  expect(await (await GET(getRequest(), context)).text()).not.toContain("private identity credential");
  expect(await (await POST(postRequest(), context)).text()).not.toContain("private identity credential");
});
