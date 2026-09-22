import type { UsageAggregate } from "@company-human/database/usage-aggregation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
const control = "focus-ring mt-2 block h-10 w-full min-w-0 rounded-8 border border-border bg-raised px-3 t-body text-ink";
/** Presentation only; server page authorizes and loads scoped rows. */
export function UsageView(props: { permitted: false } | {
 permitted: true; scope: string; selection: { environment: string; from: string; through: string };
 validQuery: boolean; usage: UsageAggregate[] | null;
}) {
 if (!props.permitted) return <><PageHeader title="Usage"/><p role="alert" className="t-body text-ink-2">You do not have permission to view usage in this workspace.</p></>;
 const { scope, selection, validQuery, usage } = props;
  return <><PageHeader title="Usage" description="Consumption reported by your workspace apps."/>
    <p className="mb-6 t-body text-ink-2">{scope} Quantities are shown separately for each product, meter and version.</p>
    <form method="get" action="/workspace/usage" className="mb-6 grid items-end gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="min-w-0 t-body-medium" htmlFor="usage-environment">Environment<select id="usage-environment" name="environment" defaultValue={selection.environment} className={control}><option value="production">Production</option><option value="test">Test</option></select></label>
      <label className="min-w-0 t-body-medium" htmlFor="usage-from">From<input id="usage-from" name="from" type="date" required defaultValue={selection.from} className={control}/></label>
      <label className="min-w-0 t-body-medium" htmlFor="usage-through">Through<input id="usage-through" name="through" type="date" required defaultValue={selection.through} className={control}/></label>
      <Button type="submit" size="lg">Apply</Button>
    </form>
    <p className="mb-6 t-caption text-ink-3">Dates include the full selected days in UTC. Late reports appear when you refresh.</p>
    {!validQuery ? <p role="alert" className="t-body text-ink-2">Choose a valid environment and date range, with the start on or before the end.</p>
      : usage === null ? <p role="alert" className="t-body text-ink-2">Usage could not be loaded. Please try again.</p>
      : usage.length === 0 ? <Card><CardContent><h2 className="t-title-3">No reported usage</h2><p className="mt-3 t-body text-ink-2">There are no usage reports available to you for this environment and period.</p></CardContent></Card>
      : <div className="space-y-4">{usage.map(row => <Card key={`${row.productId}:${row.meterKey}:${row.meterVersion}:${row.unit}`}><CardContent>
        <div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="min-w-0"><h2 className="t-title-3 break-words">{row.productName}</h2><p className="mt-2 t-body text-ink-2 break-words">{row.meterName}</p><p className="mt-1 t-caption text-ink-3 break-words">{row.meterKey} · Version {row.meterVersion}</p></div>
        <div className="min-w-0 sm:text-right"><p className="t-title-3 tabular-nums break-all">{row.quantity} <span className="t-body">{row.unit}</span></p><p className="mt-2 t-caption text-ink-3">{row.aggregation === "sum" ? "Total" : row.aggregation === "maximum" ? "Peak" : "Latest reported value"} · {row.eventCount} reports</p></div></div>
      </CardContent></Card>)}</div>}
  </>;
}
