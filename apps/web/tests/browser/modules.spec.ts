import { expect, test } from "@playwright/test";

test("administrator can turn Work off while unfinished modules stay unavailable", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/organizations/*/modules/work", async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: { setting: { moduleKey: "work", enabled: false, revision: 1 } } });
  });
  await page.goto("/?screen=modules");
  await expect(page.getByRole("heading", { name: "Human Work" })).toBeVisible();
  await expect(page.getByText("Existing assignment history is preserved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "CRM controls are not available yet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Creator or UGC controls are not available yet" })).toBeDisabled();
  await page.getByRole("button", { name: "Turn Work off" }).click();
  await expect.poll(() => body).toEqual({ enabled: false, expectedRevision: 0 });
  await expect(page.getByRole("button", { name: "Turn Work on" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("workspace-modules.png"), fullPage: true });
});
