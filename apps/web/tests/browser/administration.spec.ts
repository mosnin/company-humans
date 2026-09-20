import { expect, test } from "@playwright/test";

test("invitation produces a recipient invitation link", async ({ page }, testInfo) => {
  let body: Record<string,unknown> = {};
  await page.route("**/api/organizations/*/invitations", async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { invitePath: `/invite#${"a".repeat(43)}` }, status: 201 });
  });
  await page.goto("/?screen=people");
  await page.getByLabel("Email", { exact: true }).fill("new@example.test");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByLabel("Invitation link")).toHaveValue(/\/invite#a{43}$/);
  expect(body.recipientEmail).toBe("new@example.test"); expect(body.roleKey).toBe("contributor");
  await expect(page.getByText("no email has been sent", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("people.png"), fullPage: true });
});

test("member removal requires a second action and reports server denial", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/organizations/*/memberships/*", async route => { calls++; await route.fulfill({ status: 403, json: { error: "Membership change denied" } }); });
  await page.goto("/?screen=people");
  await page.getByRole("button", { name: "Remove", exact: true }).click(); expect(calls).toBe(0);
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByRole("alert")).toHaveText("Membership change denied"); expect(calls).toBe(1);
});

test("team assignment sends the selected membership and responsibility", async ({ page }, testInfo) => {
  let body: Record<string,unknown> = {};
  await page.route("**/api/organizations/*/teams/*/members", async route => { body=route.request().postDataJSON();await route.fulfill({ json: { status: "ok" } }); });
  await page.goto("/?screen=teams");
  await page.getByLabel("Team responsibility").selectOption("manager");
  await page.getByRole("button",{name:"Save assignment"}).click();
  await expect(page.getByRole("status")).toHaveText("Team assignment saved.");
  expect(body.teamRole).toBe("manager"); expect(body.membershipId).toBe(`ch_mem_${"b".repeat(32)}`);
  await page.screenshot({path:testInfo.outputPath("teams.png"),fullPage:true});
});

test("permission edits preserve observed state and show conflict", async ({ page }, testInfo) => {
  let body: {capabilities:string[];expectedCapabilities:string[]} | undefined;
  await page.route("**/api/organizations/*/roles/*/permissions", async route => { body=route.request().postDataJSON();await route.fulfill({status:409,json:{error:"Role permissions changed; reload before saving"}}); });
  await page.goto("/?screen=permissions");
  await page.getByLabel("View own CRM records",{exact:true}).uncheck();
  await page.getByRole("button",{name:"Save permissions"}).click();
  await expect(page.getByRole("alert")).toContainText("reload before saving");
  expect(body!.expectedCapabilities).toContain("crm.read.own");expect(body!.capabilities).not.toContain("crm.read.own");
  await page.screenshot({path:testInfo.outputPath("permissions.png"),fullPage:true});
});

test("contributor navigation excludes administrative pages", async ({ page }, testInfo) => {
  await page.goto("/?role=contributor");
  if (testInfo.project.name === "mobile") await page.getByRole("button",{name:"Menu",exact:true}).click();
  const nav=page.getByRole("navigation",{name:"Workspace",exact:true});
  await expect(nav.getByRole("link",{name:"Workspace",exact:true})).toBeVisible();
  await expect(nav.getByRole("link",{name:"People",exact:true})).toHaveCount(0);
  await expect(nav.getByRole("link",{name:"Teams",exact:true})).toHaveCount(0);
  await expect(nav.getByRole("link",{name:"Permissions",exact:true})).toHaveCount(0);
});
