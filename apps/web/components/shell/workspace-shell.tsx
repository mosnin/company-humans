"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Capability } from "@company-human/contracts";
import { SignOutButton } from "@/components/auth/sign-out";
import { cn } from "@/lib/utils";

// Generalized from company-os-web/components/shell/app-shell.tsx at 94827a3.
// Retains its full-width 56px bar, 240px rail, rounded body, and scrolling canvas.
export function WorkspaceShell({ organizationName, capabilities, children }: { organizationName: string; capabilities: readonly Capability[]; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigation = [
    { label: "Workspace", href: "/workspace", visible: true },
    { label: "People", href: "/workspace/people", visible: capabilities.includes("members.manage") },
    { label: "Teams", href: "/workspace/teams", visible: capabilities.includes("teams.manage.all") || capabilities.includes("teams.create") },
    { label: "Applications", href: "/workspace/applications", visible: capabilities.includes("applications.manage") },
    { label: "Audit", href: "/workspace/audit", visible: capabilities.includes("audit.read.all") },
    { label: "Permissions", href: "/workspace/permissions", visible: capabilities.includes("roles.manage") },
  ].filter(item => item.visible);
  return <div className="flex h-dvh flex-col bg-bar text-ink">
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 rounded-8 bg-raised px-4 py-2">Skip to content</a>
    <header className="flex h-[var(--header-h)] shrink-0 items-center justify-between gap-4 px-4 text-[var(--bar-ink)] sm:px-6">
      <Link href="/workspace" className="t-body-medium">Company Human</Link>
      <span className="t-body hidden truncate sm:block">{organizationName}</span>
      <div className="flex items-center gap-4"><Link href="/workspace/select" className="t-caption underline underline-offset-4">Switch organization</Link><SignOutButton /></div>
    </header>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[var(--body-radius)] bg-canvas md:flex-row">
      <div className="flex items-center justify-between border-b border-border bg-rail px-4 py-3 md:hidden">
        <span className="t-body-medium truncate">{organizationName}</span>
        <button type="button" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(!open)} className="focus-ring rounded-8 px-3 py-1 t-body underline underline-offset-4">{open ? "Close menu" : "Menu"}</button>
      </div>
      <nav id="workspace-navigation" aria-label="Workspace" className={cn("shrink-0 bg-rail p-3 md:block md:w-[var(--nav-w)] md:p-4", !open && "hidden")}>
        {navigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setOpen(false)} className={cn("focus-ring mb-1 block rounded-8 px-3 py-2 t-body text-ink-2 hover:bg-state-hover", pathname === item.href && "bg-raised text-ink font-medium")}>{item.label}</Link>)}
      </nav>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto px-4 py-6 outline-none sm:px-8 sm:py-8"><div className="mx-auto w-full max-w-[962px]">{children}</div></main>
    </div>
  </div>;
}
