import { expect, test } from '@playwright/test';
// Explicit component fixture: synthetic rows and identity, never live reporting/auth evidence.
test('usage preserves product names and exact quantities', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?screen=usage-view');
  await expect(page.getByText('Authentication and API responses are mocked.', { exact: false })).toBeVisible();
  for (const name of ['Scalar', 'Stored']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  for (const quantity of ['999999999999999999.123456', '0.100001']) await expect(page.getByText(quantity, { exact: false })).toBeVisible();
  await expect(page.getByText('memory · Version 2')).toBeVisible();
  await expect(page.getByText('Your own usage only.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Environment')).toHaveValue('production');
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026-09-01');
  await expect(page.getByLabel('Through')).toHaveValue('2026-09-30');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('main')!.scrollWidth <= document.querySelector('main')!.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('usage.png'), fullPage: true });
});
test('usage filters submit GET calendar and environment values', async ({ page }) => {
  await page.goto('/?screen=usage-view');
  await page.getByLabel('Environment').selectOption('test');
  await page.getByLabel('From', { exact: true }).fill('2024-02-28');
  await page.getByLabel('Through').fill('2024-02-29');
  const request = page.waitForRequest(request => new URL(request.url()).pathname === '/workspace/usage');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const sent = await request; expect(sent.method()).toBe('GET');
  expect(Object.fromEntries(new URL(sent.url()).searchParams)).toEqual({environment:'test',from:'2024-02-28',through:'2024-02-29'});
});
for (const [state, message] of [['empty','No reported usage'],['error','Usage could not be loaded'],['permission','You do not have permission'],['invalid','Choose a valid environment']] as const) {
  test(`usage distinguishes ${state} state`, async ({ page }) => {
    await page.goto(`/?screen=usage-view-${state}`);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name:'Scalar', exact:true })).toHaveCount(0);
    if (state === 'permission') await expect(page.getByRole('button',{name:'Apply',exact:true})).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
