"use client";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <div role="alert" className="space-y-4"><h1 className="t-title-2">This page could not be loaded</h1><p className="t-body text-ink-2">Please try again. Your organization access will be checked again.</p><Button onClick={reset}>Try again</Button></div>;
}
