import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@company-human/database/usage-aggregation", () => ({ aggregateUsage: mocks.usage }));
import Page from "./page";
const workspace = (capabilities = ["usage.read.own"]) => ({ context: { userId: "user", organizationId: "org", capabilities }, organization: { name: "Example" } });
const render = async (query: Record<string, string | string[] | undefined> = {}) => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(query) }));
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-22T00:15:00Z')); vi.stubEnv('DATABASE_RUNTIME_URL', 'postgresql://runtime'); mocks.workspace.mockResolvedValue(workspace()); mocks.usage.mockResolvedValue([]); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it('defaults to production current UTC month and scopes the query to verified identity', async () => {
  const html = await render(); expect(mocks.usage).toHaveBeenCalledWith('postgresql://runtime', 'user', { organizationId: 'org', environment: 'production', from: '2026-09-01T00:00:00Z', until: '2026-10-01T00:00:00.000Z', breakdown: 'product' });
  expect(html).toContain('Your own usage only'); expect(html).toContain('No reported usage');
});
it('treats the through date inclusively and separates test environment', async () => {
  await render({ environment: 'test', from: '2024-02-28', through: '2024-02-29' });
  expect(mocks.usage).toHaveBeenCalledWith('postgresql://runtime', 'user', expect.objectContaining({ environment: 'test', from: '2024-02-28T00:00:00Z', until: '2024-03-01T00:00:00.000Z' }));
});
it.each([{ from: '2026-02-30' }, { from: '2026-10-01', through: '2026-09-01' }, { environment: 'live' }, { from: ['2026-01-01', '2026-02-01'] }, { organizationId: 'other' }, { through: '9999-12-31' }])('rejects malformed or extra filters without querying: %j', async query => {
  expect(await render(query)).toContain('Choose a valid environment'); expect(mocks.usage).not.toHaveBeenCalled();
});
it('denies access before reading query data or usage', async () => {
  mocks.workspace.mockResolvedValue(workspace([])); expect(await render()).toContain('do not have permission'); expect(mocks.usage).not.toHaveBeenCalled();
  mocks.workspace.mockResolvedValue(null); expect(await Page({ searchParams: Promise.resolve({}) })).toBeNull(); expect(mocks.usage).not.toHaveBeenCalled();
});
it.each([[['usage.read.team'], 'teams you manage'], [['usage.read.team', 'usage.read.own'], 'Your usage and usage attributed'], [['usage.read.all'], 'All usage in this organization']])('explains permitted scope: %j', async (capabilities, expected) => {
  mocks.workspace.mockResolvedValue(workspace(capabilities as string[])); expect(await render()).toContain(expected as string);
});
it('renders exact quantities and names without combining unlike meters', async () => {
  const row = { productId: 'product', productName: 'Scalar', meterKey: 'credits', meterName: 'Enrichment credits', meterVersion: 1, unit: 'credit', quantity: '999999999999999999.123456', eventCount: '25', aggregation: 'sum' };
  mocks.usage.mockResolvedValue([row, { ...row, meterVersion: 2, quantity: '0.100001', aggregation: 'maximum' }]);
  const html = await render(); for (const value of ['Scalar', 'Enrichment credits', '999999999999999999.123456', '0.100001', 'Version 1', 'Version 2', 'Peak', 'Total']) expect(html).toContain(value);
});
it('distinguishes read failures and missing configuration from empty results without leaking errors', async () => {
  mocks.usage.mockRejectedValue(new Error('secret database URL')); const html = await render(); expect(html).toContain('could not be loaded'); expect(html).not.toContain('No reported usage'); expect(html).not.toContain('secret database');
  vi.stubEnv('DATABASE_RUNTIME_URL', ''); mocks.usage.mockClear(); expect(await render()).toContain('could not be loaded'); expect(mocks.usage).not.toHaveBeenCalled();
});
