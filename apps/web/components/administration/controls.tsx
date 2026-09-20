import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
// Native form controls retain company-os-web/components/ui/input.tsx controlBase geometry and states.
const fieldClass = "focus-ring h-9 w-full rounded-8 border border-border bg-raised px-3 t-body text-ink outline-none hover:border-strong focus-visible:border-ink disabled:cursor-not-allowed disabled:opacity-50";
export function Input(props: ComponentProps<"input">) { return <input {...props} className={cn(fieldClass, props.className)} />; }
export function Select(props: ComponentProps<"select">) { return <select {...props} className={cn(fieldClass, props.className)} />; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-2 t-body-medium">{label}{children}</label>; }
// Generalized from company-os-web/components/data/table.tsx: bounded keyboard scroll, raised container, stable rows.
export function AdminTable({ children, label }: { children: ReactNode; label: string }) {
  return <div className="overflow-hidden rounded-12 border border-border bg-raised"><div tabIndex={0} role="region" aria-label={label} className="focus-ring-inset overflow-x-auto outline-none">
    <table className="w-full border-collapse text-left t-body [&_th]:border-b [&_th]:border-border [&_th]:bg-inset [&_th]:px-4 [&_th]:py-3 [&_th]:font-medium [&_td]:border-b [&_td]:border-hairline [&_td]:px-4 [&_td]:py-4 [&_tbody_tr:last-child_td]:border-0">{children}</table>
  </div></div>;
}
export async function mutate(url: string, method: string, body: unknown): Promise<Record<string, string>> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not save. Please try again.");
  return result;
}
