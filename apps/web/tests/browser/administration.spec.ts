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
  expect(await page.evaluate(() => localStorage.getItem("ch_pending_invitation"))).toBeNull();
});

test("OAuth sign-in preserves invitation return and handles provider failure", async ({page}) => {
  let input: Record<string,unknown> = {};
  await page.route("**/mock-auth/sign-in", async route => {input=route.request().postDataJSON();await route.fulfill({status:503});});
  await page.goto("/?screen=oauth");
  await page.getByRole("button",{name:"Continue with Google"}).click();
  await expect(page.getByRole("alert")).toContainText("Sign-in could not start");
  expect(input).toEqual({provider:"google",redirectTo:"/auth/complete?returnTo=invite"});
  await expect(page.getByRole("button",{name:"Continue with GitHub"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Email me a sign-in link"})).toBeEnabled();
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

test('usage limits save exact quantities and lock unit interpretation',async({page},testInfo)=>{
  let calls=0;
  await page.route('**/api/organizations/*/applications/*/usage-limits',async route=>{
    calls++;const body=route.request().postDataJSON();
    expect(body.maximumQuantity).toBe(calls===1?'999999999999.999999':'0');expect(body.expectedRevision).toBe(calls-1);
    expect(body.membershipId).toBeNull();expect(body.unit).toBe('lead');
    await route.fulfill({status:200,json:{providerEnforcementConfirmed:false,revision:{schemaVersion:1,usageLimitId:`ch_lim_${'a'.repeat(32)}`,organizationId:`ch_org_${'a'.repeat(32)}`,productInstanceId:`ch_inst_${'a'.repeat(32)}`,...body,expectedRevision:undefined,revision:calls}}});
  });
  await page.goto('/?screen=usage-limits');
  const quantity=page.getByLabel('Maximum for enriched-leads · Monthly');const unit=page.getByLabel('Unit for enriched-leads · Monthly');
  await expect(page.getByText('Saved limit: Not configured · Revision 0')).toBeVisible();
  await quantity.fill('unlimited');await unit.fill('lead');await expect(page.getByRole('button',{name:'Save limit',exact:true}).first()).toBeDisabled();
  await quantity.fill('999999999999.999999');await page.getByRole('button',{name:'Save limit',exact:true}).first().click();
  await expect(page.getByRole('status')).toHaveText('Limit saved. Enforcement is not confirmed.');
  await expect(page.getByText('Saved limit: 999999999999.999999 lead · Revision 1')).toBeVisible();await expect(unit).toBeDisabled();
  await quantity.fill('0');await page.getByRole('button',{name:'Save limit',exact:true}).first().click();
  await expect(page.getByText('Saved limit: 0 lead · Revision 2')).toBeVisible();expect(calls).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('usage-limit-settings.png'),fullPage:true});
});
test('usage limit conflicts require reload and generic failures retain edits',async({page})=>{
  let calls=0;await page.route('**/api/organizations/*/applications/*/usage-limits',route=>{calls++;return route.fulfill({status:calls===1?503:409,json:{error:calls===1?'Please retry.':'Settings changed. Reload before saving.'}});});
  await page.goto('/?screen=usage-limits');await page.getByLabel('Maximum for enriched-leads · Monthly').fill('2.5');await page.getByLabel('Unit for enriched-leads · Monthly').fill('lead');
  const button=page.getByRole('button',{name:'Save limit',exact:true}).first();await button.click();
  await expect(page.getByRole('alert')).toHaveText('Please retry.');await expect(page.getByLabel('Maximum for enriched-leads · Monthly')).toHaveValue('2.5');await expect(button).toBeEnabled();
  await button.click();await expect(page.getByRole('alert')).toHaveText('Settings changed. Reload before saving.');await expect(button).toBeDisabled();await expect(page.getByRole('button',{name:'Reload settings'})).toBeVisible();
});
test('unavailable usage meters only allow an existing limit to be stopped',async({page})=>{
  await page.route('**/api/organizations/*/applications/*/usage-limits',async route=>{
    const body=route.request().postDataJSON();expect(body).toEqual({membershipId:null,meterKey:'retired-meter',unit:'lead',window:'utc_day',maximumQuantity:'0',expectedRevision:2});
    await route.fulfill({status:200,json:{providerEnforcementConfirmed:false,revision:{schemaVersion:1,usageLimitId:`ch_lim_${'a'.repeat(32)}`,organizationId:`ch_org_${'a'.repeat(32)}`,productInstanceId:`ch_inst_${'a'.repeat(32)}`,...body,expectedRevision:undefined,revision:3}}});
  });
  await page.goto('/?screen=usage-limits');const quantity=page.getByLabel('Maximum for retired-meter · Daily');
  await quantity.fill('20');await expect(page.getByRole('button',{name:'Save limit',exact:true}).nth(1)).toBeDisabled();
  await quantity.fill('0');await page.getByRole('button',{name:'Save limit',exact:true}).nth(1).click();await expect(page.getByText('Saved limit: 0 lead · Revision 3')).toBeVisible();
});
test('usage limit save blocks duplicate requests and rejects unconfirmed receipts',async({page})=>{
  let finish:(()=>void)|undefined;await page.route('**/api/organizations/*/applications/*/usage-limits',async route=>{
    await new Promise<void>(resolve=>{finish=resolve;});await route.fulfill({status:200,json:{revision:{maximumQuantity:'10'},providerEnforcementConfirmed:true}});
  });
  await page.goto('/?screen=usage-limits');await page.getByLabel('Maximum for enriched-leads · Monthly').fill('10');await page.getByLabel('Unit for enriched-leads · Monthly').fill('lead');
  await page.getByRole('button',{name:'Save limit',exact:true}).first().click();await expect(page.getByRole('button',{name:'Saving…'})).toBeDisabled();await expect(page.getByLabel('Maximum for enriched-leads · Monthly')).toBeDisabled();
  await expect.poll(()=>Boolean(finish)).toBe(true);finish!();await expect(page.getByRole('alert')).toHaveText('Save could not be confirmed. Reload settings.');await expect(page.getByRole('button',{name:'Reload settings'})).toBeVisible();await expect(page.getByRole('status')).toHaveCount(0);
});
test('member limit shows the organization cap without claiming capacity',async({page})=>{
  await page.route('**/api/organizations/*/applications/*/usage-limits',async route=>{
    const body=route.request().postDataJSON();expect(body.membershipId).toBe(`ch_mem_${'b'.repeat(32)}`);
    await route.fulfill({status:200,json:{providerEnforcementConfirmed:false,revision:{schemaVersion:1,usageLimitId:`ch_lim_${'a'.repeat(32)}`,organizationId:`ch_org_${'a'.repeat(32)}`,productInstanceId:`ch_inst_${'a'.repeat(32)}`,...body,expectedRevision:undefined,revision:1}}});
  });
  await page.goto('/?screen=member-usage-limits');await expect(page.getByText('Organization limit: 0 lead')).toBeVisible();await expect(page.getByLabel('Unit for enriched-leads · Monthly')).toBeDisabled();
  await page.getByLabel('Maximum for enriched-leads · Monthly').fill('100');await page.getByRole('button',{name:'Save limit',exact:true}).first().click();await expect(page.getByText('Organization limit: 0 lead')).toBeVisible();await expect(page.getByRole('status')).toHaveText('Limit saved. Enforcement is not confirmed.');
});
test('usage limit empty catalog is explicit',async({page})=>{
  await page.goto('/?screen=empty-usage-limits');await expect(page.getByRole('heading',{name:'No usage meters available'})).toBeVisible();await expect(page.getByRole('button',{name:'Save limit',exact:true})).toHaveCount(0);
});

test('limit delivery reports operational states and historical readback without granting access',async({page},testInfo)=>{
  for(const [state,label] of [['pending','Awaiting delivery'],['running','Delivery in progress'],['retry_wait','Waiting to retry'],['failed','Needs attention'],['superseded','Request no longer current'],['succeeded','Provider readback received']]){
    await page.goto(`/?screen=usage-limit-delivery&delivery=${state}`);
    await expect(page.getByText(`Delivery: ${label}`,{exact:true})).toBeVisible();
    if(state==='retry_wait')await expect(page.getByText('Next retry after',{exact:false})).toBeVisible();
    if(state==='failed')await expect(page.getByText('Delivery issue: provider limit mismatch')).toBeVisible();
  }
  await expect(page.getByText('It does not confirm current product access',{exact:false})).toBeVisible();
  await page.getByText('Delivery attempts',{exact:true}).click();await expect(page.getByText('Attempt 2: succeeded')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('usage-limit-delivery.png'),fullPage:true});
});
test('saving a new limit clears prior delivery status and refresh preserves unsaved input',async({page})=>{
  await page.route('**/api/organizations/*/applications/*/usage-limits',async route=>{
    const body=route.request().postDataJSON();await route.fulfill({json:{providerEnforcementConfirmed:false,revision:{schemaVersion:1,usageLimitId:`ch_lim_${'a'.repeat(32)}`,organizationId:`ch_org_${'a'.repeat(32)}`,productInstanceId:`ch_inst_${'a'.repeat(32)}`,membershipId:null,meterKey:body.meterKey,unit:body.unit,window:body.window,revision:4,maximumQuantity:body.maximumQuantity}}});
  });
  await page.goto('/?screen=usage-limit-delivery');const input=page.getByLabel('Maximum for enriched-leads · Monthly');await input.fill('12');
  await page.evaluate(()=>{window.addEventListener('test:refresh',()=>{document.body.dataset.refreshed='true';});});
  await page.getByRole('button',{name:'Refresh delivery status'}).click();await expect(input).toHaveValue('12');
  expect(await page.evaluate(()=>document.body.dataset.refreshed)).toBe('true');
  await page.getByRole('button',{name:'Save limit',exact:true}).click();await expect(page.getByRole('status')).toContainText('Enforcement is not confirmed');
  await expect(page.getByText('Delivery: Awaiting status update',{exact:true})).toBeVisible();await expect(page.getByText('Delivery: Provider readback received',{exact:true})).toHaveCount(0);
});
test('member delivery does not hide failed organization delivery',async({page})=>{
  await page.goto('/?screen=member-limit-delivery');await expect(page.getByText('Delivery: Provider readback received',{exact:true})).toBeVisible();
  await expect(page.getByText('Organization delivery: Needs attention',{exact:true})).toBeVisible();await expect(page.getByText('Organization limit: 0 lead')).toBeVisible();
  await expect(page.getByText('Delivery issue: retry exhausted')).toBeVisible();
});

test('capability delivery shows historical readback and bounded attempts',async({page},testInfo)=>{
  await page.goto('/?screen=capability-delivery');
  await expect(page.getByRole('heading',{name:'Capability delivery'})).toBeVisible();
  await expect(page.getByText('Capability delivery: Provider readback received',{exact:true})).toBeVisible();
  await expect(page.getByText('This records a past check of staged capabilities.',{exact:false})).toBeVisible();
  await page.getByText('Delivery attempts',{exact:true}).click();
  await expect(page.getByText('Attempt 1: retryable failure',{exact:true})).toBeVisible();
  await expect(page.getByText('Attempt 2: succeeded',{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('capability-delivery.png'),fullPage:true});
});
test('capability delivery identifies changed source and refresh preserves edits',async({page})=>{
  await page.goto('/?screen=stale-capabilities');
  await expect(page.getByText('Request or member eligibility changed.',{exact:false})).toBeVisible();
  await page.getByLabel('Setting for lead-enrichment').selectOption('allow');
  await page.getByRole('button',{name:'Refresh capability status'}).click();
  await expect(page.getByLabel('Setting for lead-enrichment')).toHaveValue('allow');
});
test('saving capability preferences clears stale success until refreshed data arrives',async({page})=>{
  await page.route('**/api/organizations/*/applications/*/entitlements',async route=>{
    const body=route.request().postDataJSON();
    await route.fulfill({status:200,json:{providerAccessConfirmed:false,revision:{schemaVersion:1,entitlementId:`ch_ent_${'a'.repeat(32)}`,organizationId:`ch_org_${'a'.repeat(32)}`,productInstanceId:`ch_inst_${'a'.repeat(32)}`,membershipId:body.membershipId,capability:body.capability,effect:body.effect,revision:1}}});
  });
  await page.goto('/?screen=capability-delivery');
  await page.getByLabel('Setting for lead-enrichment').selectOption('allow');
  await page.getByRole('button',{name:'Save setting'}).click();
  await expect(page.getByText('Settings changed. Awaiting updated delivery status.',{exact:true})).toBeVisible();
  await expect(page.getByText('Capability delivery: Provider readback received',{exact:true})).toHaveCount(0);
});


test("existing organization connection stays pending and locks the submitted target", async ({ page }, testInfo) => {
  let body: unknown;
  await page.route("**/api/organizations/*/applications/*/connect", async route => {
    body = route.request().postDataJSON();
    await route.fulfill({status:202,json:{operationId:"fixture-operation",providerConnectionConfirmed:false}});
  });
  await page.goto("/?screen=connect-application");
  await expect(page.getByRole("button",{name:"Request connection",exact:true})).toBeDisabled();
  await page.getByLabel("Scalar organization ID",{exact:true}).fill("  scalar-workspace  ");
  await page.getByRole("button",{name:"Request connection",exact:true}).click();
  expect(body).toEqual({externalOrganizationId:"scalar-workspace"});
  await expect(page.getByText("Connection requested. Provider verification is pending; product access has not been confirmed.")).toBeVisible();
  await expect(page.getByLabel("Scalar organization ID",{exact:true})).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("application-connection.png"),fullPage:true});
});

test("connection conflict preserves the organization ID and reports the server error", async ({ page }) => {
  await page.route("**/api/organizations/*/applications/*/connect",route=>route.fulfill({status:409,json:{error:"A different organization was already requested. Refresh to review connection progress."}}));
  await page.goto("/?screen=connect-application");
  await page.getByLabel("Scalar organization ID",{exact:true}).fill("scalar-workspace");
  await page.getByRole("button",{name:"Request connection",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("A different organization was already requested");
  await expect(page.getByLabel("Scalar organization ID",{exact:true})).toHaveValue("scalar-workspace");
  await expect(page.getByRole("button",{name:"Request connection",exact:true})).toBeEnabled();
});


test("catalog requests the selected organization mode and keeps draft products unavailable",async({page},testInfo)=>{
 let body:unknown;await page.route("**/api/organizations/*/applications",async route=>{body=route.request().postDataJSON();await route.fulfill({status:202,json:{instanceId:"fixture"}});});
 await page.goto("/?screen=application-catalog");await page.getByText("Permissions and usage",{exact:true}).click();
 await expect(page.getByText("lead-enrichment",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Set up Stored"})).toHaveCount(0);
 await page.getByLabel("Scalar setup type").selectOption("connected");await page.getByRole("button",{name:"Set up Scalar"}).click();
 expect(body).toEqual({productId:`ch_prod_${"a".repeat(32)}`,mode:"connected",instanceKey:"primary"});
 await expect(page.getByRole("status")).toContainText("access is not confirmed");await expect(page.getByLabel("Scalar setup type")).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath("application-catalog.png"),fullPage:true});
});
test("catalog preserves setup choice when the server denies a changed registration",async({page})=>{
 await page.route("**/api/organizations/*/applications",route=>route.fulfill({status:403,json:{error:"Application setup unavailable or permission denied"}}));
 await page.goto("/?screen=application-catalog");await page.getByLabel("Scalar setup type").selectOption("connected");await page.getByRole("button",{name:"Set up Scalar"}).click();
 await expect(page.getByRole("alert")).toContainText("unavailable");await expect(page.getByLabel("Scalar setup type")).toHaveValue("connected");await expect(page.getByRole("button",{name:"Set up Scalar"})).toBeEnabled();
});


test("health view distinguishes historical success, stale results and failed checks",async({page},testInfo)=>{
 await page.goto("/?screen=health-healthy");await expect(page.getByRole("heading",{name:"Healthy at last check"})).toBeVisible();await expect(page.getByText("0",{exact:true})).toBeVisible();
 await expect(page.getByText("Not reported",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Refresh recorded status"}).click();
 await expect(page.getByText("Refresh reloads saved results.",{exact:false})).toBeVisible();
 await page.goto("/?screen=health-stale");await expect(page.getByRole("heading",{name:"Health check is stale"})).toBeVisible();await expect(page.getByRole("heading",{name:"Healthy at last check"})).toHaveCount(0);
 await page.goto("/?screen=health-failed");await expect(page.getByText("Previous successful checks do not confirm current health.",{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath("application-health.png"),fullPage:true});
});
test("health view explains missing, degraded and reauthorization states",async({page})=>{
 await page.goto("/?screen=health-empty");await expect(page.getByRole("heading",{name:"Health not checked"})).toBeVisible();
 await page.goto("/?screen=health-degraded");await expect(page.getByRole("heading",{name:"Degraded at last check"})).toBeVisible();
 await page.goto("/?screen=health-reauth");await expect(page.getByText("Reauthorization is not available here yet.",{exact:false})).toBeVisible();
 await expect(page.getByRole("button",{name:"Reconnect",exact:true})).toHaveCount(0);
});

test("email sign-in normalizes email, preserves invitation return and shows delivery acknowledgement", async ({ page }) => {
  let input: Record<string, unknown> = {};
  await page.route("**/mock-auth/sign-in", async route => {
    input = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: {} });
  });
  await page.goto("/?screen=oauth");
  await page.getByLabel("Email address").fill("Person@Example.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  expect(input).toEqual({ provider: "email", email: "person@example.test", redirectTo: "/auth/complete?returnTo=invite" });
  await page.getByRole("button", { name: "Use another email or resend" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("invitation survives a new tab but is not restored after expiry", async ({ page, context }) => {
  const token = "b".repeat(43);
  await page.goto(`/?screen=invite#${token}`);
  await expect(page.getByLabel("Invitation code")).toHaveValue(token);
  const nextTab = await context.newPage();
  await nextTab.goto("/?screen=invite");
  await expect(nextTab.getByLabel("Invitation code")).toHaveValue(token);
  await nextTab.evaluate(() => localStorage.setItem("ch_pending_invitation", JSON.stringify({ token: "b".repeat(43), expiresAt: Date.now() - 1 })));
  await nextTab.reload();
  await expect(nextTab.getByLabel("Invitation code")).toHaveValue("");
  expect(await nextTab.evaluate(() => localStorage.getItem("ch_pending_invitation"))).toBeNull();
});
