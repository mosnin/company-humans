import type { ActivationReadiness, ActivationReadinessReason } from "@company-human/database/member-activation-readiness";
import { Card, CardContent } from "@/components/ui/card";

const reasons: Record<ActivationReadinessReason, { title: string; detail: string }> = {
  membership_unavailable: { title: "Member mapping unavailable", detail: "This member mapping is not available in the selected workspace and application." },
  identity_inactive: { title: "Workspace identity inactive", detail: "The organization, user, or workspace membership is not active." },
  product_unavailable: { title: "Application unavailable", detail: "The catalog or connected application has not met the required provisioning state." },
  role_not_authorized: { title: "Role permissions missing", detail: "The member's current role does not include every permission required by this application." },
  mapping_not_suspended: { title: "Suspended mapping required", detail: "The member mapping is not in the suspended preparation state required before activation." },
  binding_unverified: { title: "Provider member binding unverified", detail: "The suspended provider member has no matching successful bootstrap receipt for this mapping." },
  denial_outstanding: { title: "Access denial still outstanding", detail: "The current access revision has no matching provider suspension readback." },
  capability_snapshot_missing: { title: "Capability snapshot missing", detail: "No capability snapshot has been prepared for this member." },
  capability_snapshot_stale: { title: "Capability snapshot stale", detail: "The prepared snapshot no longer matches the current role, entitlement, or application policy." },
  capability_readback_missing: { title: "Capability delivery unverified", detail: "The current capability snapshot has no matching successful provider apply and readback receipts." },
  limit_policy_missing: { title: "Usage limit policy missing", detail: "One or more declared meters lacks an organization limit, or a saved limit has no current policy revision." },
  limit_readback_missing: { title: "Usage limit delivery unverified", detail: "A current usage limit has no matching successful provider apply and readback receipts." },
  meter_semantics_unverified: { title: "Meter enforcement unverified", detail: "Meter names alone do not establish complete units, windows, expensive operation coverage, or provider hard stops." },
};

/** Read-only diagnosis. This component deliberately has no activation or launch control. */
export function MemberActivationReadiness({ diagnostic }: { diagnostic: ActivationReadiness }) {
  return <div className="space-y-5">
    <Card><CardContent>
      <h2 className="t-title-3">Activation remains blocked</h2>
      <p className="mt-2 t-body text-ink-2">This read-only check summarizes current records. It does not grant product access or confirm live provider enforcement.</p>
      <dl className="mt-5 grid gap-2 t-body sm:grid-cols-3">
        <div><dt className="text-ink-3">Capability policy revision</dt><dd>{diagnostic.evidence.capabilityRevision ?? "None recorded"}</dd></div>
        <div><dt className="text-ink-3">Limits examined</dt><dd>{diagnostic.evidence.checkedLimitCount}</dd></div>
        <div><dt className="text-ink-3">Catalog meter keys</dt><dd>{diagnostic.evidence.declaredMeterCount}</dd></div>
      </dl>
    </CardContent></Card>
    <Card><CardContent>
      <h2 className="t-title-3">Checks requiring attention</h2>
      {diagnostic.reasons.length ? <ul className="mt-4 space-y-4">{diagnostic.reasons.map(reason => <li key={reason} className="border-t border-border pt-4 first:border-0 first:pt-0">
        <h3 className="t-body font-medium">{reasons[reason].title}</h3>
        <p className="mt-1 t-body text-ink-2">{reasons[reason].detail}</p>
      </li>)}</ul> : <p className="mt-3 t-body text-ink-2">No specific saved check failed. Activation still requires a verified provider meter and enforcement contract.</p>}
    </CardContent></Card>
  </div>;
}
