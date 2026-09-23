import { expect, test } from "@playwright/test";

test("contributor reports human work with required evidence", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/organizations/*/work/*/complete", async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: { status: "reported_complete" } });
  });
  await page.goto("/?screen=work-own&role=contributor");
  await expect(page.getByRole("heading", { name: "Call the lead" })).toBeVisible();
  await expect(page.getByText("A qualified conversation")).toBeVisible();
  await page.getByLabel("What did you accomplish?").fill("Spoke with the owner");
  await page.getByRole("button", { name: "Report complete" }).click();
  await expect(page.getByLabel("Evidence (required)")).toHaveAttribute("required", "");
  expect(body).toBeNull();
  await page.getByLabel("Evidence (required)").fill("Call notes saved");
  await page.getByRole("button", { name: "Report complete" }).click();
  await expect.poll(() => body).toEqual({ outcome: "Spoke with the owner", evidence: "Call notes saved" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("human-work-contributor.png"), fullPage: true });
});

test("manager assigns a scoped team member and sees reported work", async ({ page }, testInfo) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/organizations/*/work", async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { assignmentId: "ch_hwrk_fixture" } });
  });
  await page.goto("/?screen=work-team");
  await expect(page.getByRole("heading", { name: /Reported complete/ })).toBeVisible();
  await expect(page.getByText("Asked for a proposal")).toBeVisible();
  await page.getByLabel("Assignee").selectOption({ label: "Test Contributor · Sales" });
  await page.getByLabel("Title").fill("Follow up with the lead");
  await page.getByLabel("Objective").fill("Schedule the product demo");
  await page.getByLabel("Expected outcome").fill("Demo date agreed");
  await page.getByRole("button", { name: "Assign work" }).click();
  await expect.poll(() => body).toMatchObject({ title: "Follow up with the lead", objective: "Schedule the product demo", expectedOutcome: "Demo date agreed", priority: "normal", evidenceRequired: true });
  expect((body as Record<string, unknown> | null)?.teamId).toBe(`ch_team_${"a".repeat(32)}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("human-work-manager.png"), fullPage: true });
});
