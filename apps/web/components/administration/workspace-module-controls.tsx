"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceModuleKey, WorkspaceModuleSetting } from "@company-human/database/workspace-modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const modules: ReadonlyArray<{ key: WorkspaceModuleKey; name: string; purpose: string }> = [
  { key: "work", name: "Human Work", purpose: "Assign human actions and let contributors report outcomes with evidence." },
  { key: "crm", name: "CRM", purpose: "Keep contacts, accounts, opportunities, and follow ups in one place." },
  { key: "referrals", name: "Referrals", purpose: "Give contributors merchant referral links and track attributed activity." },
  { key: "earnings", name: "Earnings", purpose: "Show commission states, fees, and payout history." },
  { key: "leaderboard", name: "Leaderboard", purpose: "Show permitted team performance and progress." },
  { key: "team", name: "Team", purpose: "Share announcements, wins, resources, and team goals." },
  { key: "context", name: "Context", purpose: "Share approved company knowledge within role and team scopes." },
  { key: "creator", name: "Creator or UGC", purpose: "Manage briefs, deliverables, approvals, and publishing." },
];

export class WorkspaceModuleSaveConflict extends Error {
  constructor(message = "This setting changed. Reload before trying again.") {
    super(message);
    this.name = "WorkspaceModuleSaveConflict";
  }
}

/** Require a matching revision receipt before claiming the requested state is saved. */
export async function saveWorkModule(organizationId: string, enabled: boolean, expectedRevision: number): Promise<WorkspaceModuleSetting> {
  const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/modules/work`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled, expectedRevision }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (response.status === 409) throw new WorkspaceModuleSaveConflict();
  if (!response.ok) {
    const error = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
      ? result.error : "Could not save the Work setting. Please try again.";
    throw new Error(error);
  }
  const setting = typeof result === "object" && result !== null && "setting" in result ? result.setting : null;
  if (typeof setting !== "object" || setting === null || !("moduleKey" in setting) || setting.moduleKey !== "work" ||
    !("enabled" in setting) || setting.enabled !== enabled || !("revision" in setting) || setting.revision !== expectedRevision + 1) {
    throw new WorkspaceModuleSaveConflict("The save could not be confirmed. Reload settings before trying again.");
  }
  return { moduleKey: "work", enabled, revision: expectedRevision + 1 };
}

export function WorkspaceModuleControls({ organizationId, settings }: { organizationId: string; settings: WorkspaceModuleSetting[] }) {
  const router = useRouter();
  const initialWork = settings.find(setting => setting.moduleKey === "work") ?? null;
  const [work, setWork] = useState(initialWork);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setWork(initialWork), [initialWork]);

  async function toggleWork() {
    if (!work || busy || conflict) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const updated = await saveWorkModule(organizationId, !work.enabled, work.revision);
      setWork(updated);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      if (cause instanceof WorkspaceModuleSaveConflict) setConflict(true);
      setError(cause instanceof Error ? cause.message : "Could not save the Work setting. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4">
    <p className="t-body text-ink-2">Choose the native workspace experiences your team can use. Connected applications and their access are managed separately.</p>
    <div className="grid gap-4 lg:grid-cols-2">
      {modules.map(module => {
        const setting = module.key === "work" ? work : settings.find(item => item.moduleKey === module.key);
        const available = module.key === "work";
        const configured = setting ? (setting.enabled ? "On" : "Off") : "Unavailable";
        return <Card key={module.key}><CardContent className="h-full justify-between">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="t-title-3">{module.name}</h2>
              <span className="t-caption text-ink-2">{available ? (setting ? (setting.enabled ? "Enabled" : "Disabled") : "Setting unavailable") : "Not available yet"}</span>
            </div>
            <p className="mt-2 t-body text-ink-2">{module.purpose}</p>
            {available ? <p id="work-module-effect" className="mt-3 t-caption text-ink-3">Turning Work off hides the Work queue and stops assignment creation and completion. Existing assignment history is preserved.</p>
              : <p className="mt-3 t-caption text-ink-3">Requested setting: {configured}. The workspace experience is not available yet.</p>}
          </div>
          {available ? <div className="space-y-2">
            <Button type="button" aria-pressed={setting?.enabled ?? false} aria-describedby="work-module-effect" disabled={!setting || busy || conflict}
              loading={busy} onClick={() => void toggleWork()}>{busy ? "Saving…" : setting?.enabled ? "Turn Work off" : "Turn Work on"}</Button>
            {conflict && <Button type="button" variant="secondary" className="ml-2" onClick={() => window.location.reload()}>Reload settings</Button>}
            {error && <p role="alert" className="t-body text-critical-text">{error}</p>}
            {saved && <p role="status" className="t-body">Work setting saved.</p>}
          </div> : <Button type="button" variant="secondary" disabled aria-label={`${module.name} controls are not available yet`}>Not available yet</Button>}
        </CardContent></Card>;
      })}
    </div>
  </div>;
}
