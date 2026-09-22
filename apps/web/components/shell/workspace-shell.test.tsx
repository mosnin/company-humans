import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Capability } from "@company-human/contracts";
vi.mock('next/navigation', () => ({ usePathname: () => '/workspace/usage' }));
vi.mock('@/components/auth/sign-out', () => ({ SignOutButton: () => null }));
import { WorkspaceShell } from './workspace-shell';
it.each(['usage.read.own', 'usage.read.team', 'usage.read.all'] as const)('shows Usage for %s', capability => {
  const html = renderToStaticMarkup(<WorkspaceShell organizationName="Example" capabilities={[capability]}><p>Page</p></WorkspaceShell>);
  expect(html).toContain('href="/workspace/usage"'); expect(html).toContain('aria-current="page"');
});
it('hides Usage when the role has no usage capability', () => {
  const html = renderToStaticMarkup(<WorkspaceShell organizationName="Example" capabilities={['members.manage'] as Capability[]}><p>Page</p></WorkspaceShell>);
  expect(html).not.toContain('href="/workspace/usage"');
});

it('shows Teams for an assigned-team manager without organization-wide authority', () => {
  const html = renderToStaticMarkup(<WorkspaceShell organizationName="Example" capabilities={['teams.manage.assigned']}><p>Page</p></WorkspaceShell>);
  expect(html).toContain('href="/workspace/teams"');
  expect(html).not.toContain('href="/workspace/people"');
});
