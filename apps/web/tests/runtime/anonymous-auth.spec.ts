import { expect, test } from "@playwright/test";

// No route interception, fixture identities, seeded users, or provider bypass.
// Run with the local Convex backend and no enabled OAuth providers.
test("local backend and real API deny anonymous identity and mutations", async ({ request }) => {
  const identity = await request.post("http://127.0.0.1:3210/api/query", {
    data: { path: "identity:current", args: {}, format: "json" },
  });
  expect(identity.status()).toBe(200);
  expect(await identity.json()).toMatchObject({ status: "success", value: null });
  const organizations = await request.get("/api/organizations");
  expect(organizations.status()).toBe(401);
  expect(await organizations.json()).toEqual({ error: "Authentication required" });
  const sync = await request.post("/api/identity/sync", { headers: { Origin: "http://127.0.0.1:3000" } });
  expect(sync.status()).toBe(401);
  expect(await sync.json()).toEqual({ error: "Sign in required" });
  for (const origin of [undefined, "https://foreign.example"]) {
    const denied = await request.post("/api/identity/sync", { headers: origin ? { Origin: origin } : {} });
    expect(denied.status()).toBe(403);
    expect(await denied.json()).toEqual({ error: "Request denied" });
  }
});

test("unconfigured sign-in and organization selection expose no protected actions", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with/ })).toHaveCount(0);
  await page.goto("/workspace/select");
  await expect(page.getByRole("alert").filter({ hasText: "Sign in to see your organizations." })).toHaveText("Sign in to see your organizations.");
  await expect(page.getByRole("button", { name: "Create organization" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("anonymous-organization-selection.png"), fullPage: true });
  await page.goto("/workspace/applications");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in unavailable" })).toBeVisible();
  expect(errors).toEqual([]);
});
