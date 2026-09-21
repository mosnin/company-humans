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
  await expect(nav.getByRole("link",{name:"Applications",exact:true})).toHaveCount(0);
  await expect(nav.getByRole("link",{name:"Teams",exact:true})).toHaveCount(0);
  await expect(nav.getByRole("link",{name:"Permissions",exact:true})).toHaveCount(0);
});


test("invitation survives sign-in navigation without a URL token and clears on acceptance", async ({ page }) => {
  let signedIn = false;
  const token = "a".repeat(43);
  await page.route("**/api/invitations/accept", async route => {
    expect(route.request().postDataJSON().token).toBe(token);
    await route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { membershipId: "test" } : { error: "Authentication required" } });
  });
  await page.goto(`/?screen=invite#${token}`);
  await expect(page.getByLabel("Invitation code")).toHaveValue(token);
  expect(new URL(page.url()).hash).toBe("");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/sign-in?returnTo=invite");
  signedIn = true;
  await page.goto("/?screen=invite");
  await expect(page.getByLabel("Invitation code")).toHaveValue(token);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.waitForURL("**/workspace/select");
  expect(await page.evaluate(() => sessionStorage.getItem("ch_pending_invitation"))).toBeNull();
});

test("OAuth sign-in preserves invitation return and handles provider failure", async ({page}) => {
  let input: Record<string,unknown> = {};
  await page.route("**/mock-auth/sign-in", async route => {input=route.request().postDataJSON();await route.fulfill({status:503});});
  await page.goto("/?screen=oauth");
  await page.getByRole("button",{name:"Continue with Google"}).click();
  await expect(page.getByRole("alert")).toContainText("Sign-in could not start");
  expect(input).toEqual({provider:"google",redirectTo:"/auth/complete?returnTo=invite"});
  await expect(page.getByRole("button",{name:"Continue with GitHub"})).toBeEnabled();
});
test("sign-out waits for session revocation before leaving", async ({page}) => {
  await page.route("**/mock-auth/sign-out", route => route.fulfill({status:503}));
  await page.goto("/?screen=people");
  await page.getByRole("button",{name:"Sign out",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Sign-out failed");
  await expect(page).toHaveURL(/screen=people/);
});

test("application setup failures expose history without claiming product access", async ({ page }, testInfo) => {
  await page.goto("/?screen=applications");
  await expect(page.getByRole("heading", { name: "Scalar", exact: true })).toBeVisible();
  await expect(page.getByText("Setup needs attention", { exact: true })).toBeVisible();
  await page.getByText("Setup attempt history", { exact: true }).click();
  await expect(page.getByText("Attempt 1 · permanent failure", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("applications.png"), fullPage: true });
});
test("applications explain the empty configuration", async ({ page }) => {
  await page.goto("/?screen=empty-applications");
  await expect(page.getByRole("heading", { name: "No applications configured" })).toBeVisible();
});


test("invitation revocation confirms intent and preserves retry after denial", async ({ page }, testInfo) => {
  let calls = 0;
  await page.route("**/api/organizations/*/invitations/*", async route => {
    expect(route.request().method()).toBe("DELETE"); calls++;
    await route.fulfill(calls === 1 ? { status:403,json:{error:"Revocation denied"} } : { json:{status:"revoked"} });
  });
  await page.goto("/?screen=invitations");
  await page.getByRole("button",{name:"Revoke invitation",exact:true}).click();
  expect(calls).toBe(0);
  await page.getByRole("button",{name:"Confirm revocation"}).click();
  await expect(page.getByRole("alert")).toHaveText("Revocation denied");
  await page.getByRole("button",{name:"Confirm revocation"}).click();
  await expect(page.getByRole("status")).toHaveText("Invitation revoked.");
  expect(calls).toBe(2);
  await expect(page.getByRole("cell",{name:"revoked",exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("invitation-revoked.png"),fullPage:true});
});

test("application disable confirms scope, recovers failure and distinguishes remote access", async ({page},testInfo) => {
  let calls=0;
  let finish: (()=>void)|undefined;
  await page.route("**/api/organizations/*/applications/*/disable",async route=>{
    calls++;expect(route.request().method()).toBe("POST");
    if(calls===1) {await route.fulfill({status:503,json:{error:"Could not disable application. Please retry."}});return;}
    await new Promise<void>(resolve=>{finish=resolve;});
    await route.fulfill({status:202,json:{desiredEnabled:false,remoteRevocationConfirmed:false}});
  });
  await page.goto("/?screen=applications");
  await page.getByRole("button",{name:"Disable application",exact:true}).click();
  await expect(page.getByText("Existing access in the connected product may continue",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();expect(calls).toBe(0);
  await page.getByRole("button",{name:"Disable application",exact:true}).click();
  await page.getByRole("button",{name:"Confirm disable",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Please retry");
  await expect(page.getByRole("status")).toHaveText("Setup needs attention");
  await page.getByRole("button",{name:"Confirm disable",exact:true}).click();
  await expect(page.getByRole("button",{name:"Disabling…",exact:true})).toBeDisabled();
  await expect.poll(()=>Boolean(finish)).toBe(true);finish!();
  await expect(page.getByRole("status")).toHaveText("Disabled in workspace");
  await expect(page.getByText("New workspace access is disabled. Remote access changes have not been confirmed.",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Disable application",exact:true})).toHaveCount(0);
  expect(calls).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("application-disabled.png"),fullPage:true});
});

test("application members distinguish queued, failed and provider-reported denial",async({page},testInfo)=>{
  await page.goto('/?screen=application-members');
  await expect(page.getByRole('row',{name:/Queued Contributor/})).toContainText('Awaiting worker');
  const failed=page.getByRole('row',{name:/Retry Contributor/});
  await expect(failed).toContainText('Needs attention');
  await failed.getByText('Attempt history',{exact:true}).click();
  await expect(failed).toContainText('adapter transport failure');
  await expect(page.getByRole('row',{name:/Removed Contributor/})).toContainText('Provider reported removal');
  await expect(page.getByText('Requested access does not prove product access.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('application-members.png'),fullPage:true});
});
test("application member list explains an empty mapping",async({page})=>{
  await page.goto('/?screen=empty-application-members');
  await expect(page.getByRole('cell',{name:'No members mapped to this application.'})).toBeVisible();
});

test('entitlement settings save versioned intent and keep provider access unconfirmed',async({page},testInfo)=>{
  let calls=0;
  await page.route('**/api/organizations/*/applications/*/entitlements',async route=>{
    calls++;const body=route.request().postDataJSON();
    expect(body).toEqual({membershipId:null,capability:'lead-enrichment',effect:calls===1?'allow':'deny',expectedRevision:calls-1});
    await route.fulfill({status:200,json:{providerAccessConfirmed:false,revision:{schemaVersion:1,entitlementId:`ch_ent_${'a'.repeat(32)}`,organizationId:`ch_org_${'a'.repeat(32)}`,productInstanceId:`ch_inst_${'a'.repeat(32)}`,...body,revision:calls,expectedRevision:undefined}}});
  });
  await page.goto('/?screen=entitlements');
  const select=page.getByLabel('Setting for lead-enrichment');
  await select.selectOption('allow');await page.getByRole('button',{name:'Save setting',exact:true}).first().click();
  await expect(page.getByRole('status')).toHaveText('Setting saved. Product access is not confirmed.');
  await expect(page.getByText('Saved request: Allow · Revision 1')).toBeVisible();
  await select.selectOption('deny');await page.getByRole('button',{name:'Save setting',exact:true}).first().click();
  await expect(page.getByText('Saved request: Deny · Revision 2').first()).toBeVisible();
  expect(calls).toBe(2);
  await expect(page.getByLabel('Setting for retired-capability').locator('option[value="allow"]')).toHaveJSProperty('disabled',true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('entitlement-settings.png'),fullPage:true});
});
test('entitlement conflict blocks retry until reload',async({page})=>{
  await page.route('**/api/organizations/*/applications/*/entitlements',route=>route.fulfill({status:409,json:{error:'Settings changed. Reload before saving.'}}));
  await page.goto('/?screen=entitlements');
  await page.getByLabel('Setting for lead-enrichment').selectOption('allow');
  await page.getByRole('button',{name:'Save setting',exact:true}).first().click();
  await expect(page.getByRole('alert')).toHaveText('Settings changed. Reload before saving.');
  await expect(page.getByRole('button',{name:'Save setting',exact:true}).first()).toBeDisabled();
  await expect(page.getByRole('button',{name:'Reload settings'})).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});
test('entitlement failure retains edits and allows retry',async({page})=>{
  await page.route('**/api/organizations/*/applications/*/entitlements',route=>route.fulfill({status:503,json:{error:'Please retry.'}}));
  await page.goto('/?screen=entitlements');await page.getByLabel('Setting for lead-enrichment').selectOption('allow');
  await page.getByRole('button',{name:'Save setting',exact:true}).first().click();
  await expect(page.getByRole('alert')).toHaveText('Please retry.');
  await expect(page.getByLabel('Setting for lead-enrichment')).toHaveValue('allow');
  await expect(page.getByRole('button',{name:'Save setting',exact:true}).first()).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
});
test('entitlement empty catalog is explicit',async({page})=>{
  await page.goto('/?screen=empty-entitlements');
  await expect(page.getByRole('heading',{name:'No capabilities available'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save setting',exact:true})).toHaveCount(0);
});
test('entitlement saving prevents duplicate requests and rejects malformed receipts',async({page})=>{
  let finish:(()=>void)|undefined;
  await page.route('**/api/organizations/*/applications/*/entitlements',async route=>{
    await new Promise<void>(resolve=>{finish=resolve;});
    await route.fulfill({status:200,json:{revision:{effect:'allow'},providerAccessConfirmed:true}});
  });
  await page.goto('/?screen=entitlements');await page.getByLabel('Setting for lead-enrichment').selectOption('allow');
  await page.getByRole('button',{name:'Save setting',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'Saving…'})).toBeDisabled();
  await expect(page.getByLabel('Setting for lead-enrichment')).toBeDisabled();
  await expect.poll(()=>Boolean(finish)).toBe(true);finish!();
  await expect(page.getByRole('alert')).toHaveText('Save could not be confirmed. Reload settings.');
  await expect(page.getByRole('status')).toHaveCount(0);
});
test('member allow preserves organization denial and sends the selected member',async({page})=>{
  await page.route('**/api/organizations/*/applications/*/entitlements',async route=>{
    const body=route.request().postDataJSON();
    expect(body.membershipId).toBe(`ch_mem_${'b'.repeat(32)}`);
    await route.fulfill({status:200,json:{providerAccessConfirmed:false,revision:{schemaVersion:1,entitlementId:`ch_ent_${'a'.repeat(32)}`,organizationId:`ch_org_${'a'.repeat(32)}`,productInstanceId:`ch_inst_${'a'.repeat(32)}`,membershipId:body.membershipId,capability:body.capability,effect:body.effect,revision:1}}});
  });
  await page.goto('/?screen=member-entitlements');
  await expect(page.getByText('Organization default: deny')).toBeVisible();
  await page.getByLabel('Setting for lead-enrichment').selectOption('allow');
  await page.getByRole('button',{name:'Save setting',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Setting saved. Product access is not confirmed.');
  await expect(page.getByText('Saved request: Deny · Revision 1')).toBeVisible();
});
test('member access request preserves retry and acknowledges intent only',async({page},testInfo)=>{
  let calls=0;
  await page.route('**/api/organizations/*/applications/*/members',async route=>{
    calls++;expect(route.request().postDataJSON()).toEqual({membershipId:`ch_mem_${'b'.repeat(32)}`});
    await route.fulfill(calls===1?{status:503,json:{error:'Could not request access. Please retry.'}}:{status:202,json:{productMembershipId:`ch_pmem_${'a'.repeat(32)}`,providerAccessConfirmed:false}});
  });
  await page.goto('/?screen=request-members');
  await page.getByRole('button',{name:'Request access',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Please retry');
  await page.getByRole('button',{name:'Request access',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Request recorded. Product access is not confirmed.');
  await expect(page.getByRole('button',{name:'Request access',exact:true})).toHaveCount(0);
  expect(calls).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('member-request.png'),fullPage:true});
});
test('member selection explains empty eligibility',async({page})=>{
  await page.goto('/?screen=empty-request-members');await expect(page.getByRole('cell',{name:'No eligible members match this search.'})).toBeVisible();
});
