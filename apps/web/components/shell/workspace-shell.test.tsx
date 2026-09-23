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

it('shows Work only when the native module and assignment read are both available', () => {
  const allowed = renderToStaticMarkup(<WorkspaceShell organizationName="Example" capabilities={['assignments.read.own']} workEnabled><p>Page</p></WorkspaceShell>);
  expect(allowed).toContain('href="/workspace/work"');
  const disabled = renderToStaticMarkup(<WorkspaceShell organizationName="Example" capabilities={['assignments.read.own']}><p>Page</p></WorkspaceShell>);
  expect(disabled).not.toContain('href="/workspace/work"');
  const denied = renderToStaticMarkup(<WorkspaceShell organizationName="Example" capabilities={['members.manage']} workEnabled><p>Page</p></WorkspaceShell>);
  expect(denied).not.toContain('href="/workspace/work"');
});

it('shows workspace module settings only to organization managers', () => {
  const manager = renderToStaticMarkup(<WorkspaceShell organizationName="Example" capabilities={['organization.manage']}><p>Page</p></WorkspaceShell>);
  expect(manager).toContain('href="/workspace/modules"');
  const contributor = renderToStaticMarkup(<WorkspaceShell organizationName="Example" capabilities={['assignments.read.own']} workEnabled><p>Page</p></WorkspaceShell>);
  expect(contributor).not.toContain('href="/workspace/modules"');
});
