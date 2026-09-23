import { expect, test } from "@playwright/test";

test("contributor Home prioritizes real human work without claiming app launch", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?screen=home&role=contributor");
  await expect(page.getByRole("heading", { name: "What needs your attention" })).toBeVisible();
  await expect(page.getByText("Call the lead")).toBeVisible();
  await expect(page.getByText("Review the proposal")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Work" })).toHaveAttribute("href", "/workspace/work");
  await expect(page.getByText("App access can be setting up, paused, or unavailable")).toBeVisible();
  await expect(page.getByRole("link", { name: "View your apps" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("contributor-home.png"), fullPage: true });
});
