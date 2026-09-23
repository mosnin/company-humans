"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogApplication } from "@company-human/database/administration";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select, mutate } from "./controls";

export function ApplicationCatalog({products,organizationId}:{products:CatalogApplication[];organizationId:string}) {
  return <section className="space-y-4" aria-label="Application catalog"><h2 className="t-title-2">Add an application</h2>
    <p className="t-body text-ink-2">Choose the tools your organization will make available. Access starts after setup, permissions and limits are confirmed.</p>
    {!products.length && <p className="t-body">No applications are available in the catalog.</p>}
    {products.map(product=><CatalogEntry key={product.id} product={product} organizationId={organizationId} />)}
  </section>;
}
function CatalogEntry({product,organizationId}:{product:CatalogApplication;organizationId:string}) {
  const router=useRouter();const [mode,setMode]=useState(product.modes[0] ?? "provisioned");
  const [busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[error,setError]=useState("");
  async function request(){
    if(busy || submitted || !product.ready)return;
    setBusy(true);setError("");
    try {await mutate(`/api/organizations/${organizationId}/applications`,"POST",{productId:product.id,mode,instanceKey:"primary"});setSubmitted(true);router.refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:"Could not request setup.");}finally{setBusy(false);}
  }
  return <Card><CardContent><h3 className="t-title-3">{product.name}</h3>
    <p className="t-body text-ink-2">{product.description ?? "This integration is being prepared."}</p>
    {!product.ready ? <p className="t-body text-ink-2">Setup unavailable. This product does not yet have a ready organization setup configuration.</p> : <div className="space-y-3">
      <details><summary className="t-body cursor-pointer">Permissions and usage</summary><dl className="mt-3 space-y-2 t-body">
        <dt className="font-medium">Capabilities</dt><dd className="break-words">{product.capabilities.join(", ") || "None declared"}</dd>
        <dt className="font-medium">Required permissions</dt><dd className="break-words">{product.requiredPermissions.join(", ") || "None declared"}</dd>
        <dt className="font-medium">Usage meters</dt><dd className="break-words">{product.usageMeters.join(", ") || "None declared"}</dd>
        <dt className="font-medium">Connection requirements</dt><dd className="break-words">{product.connectionRequirements.join(", ") || "None declared"}</dd>
      </dl></details>
      <p className="t-caption text-ink-2">{product.billingBehavior === "organization_sponsored" ? "Your organization sponsors access. Members do not need a separate product plan." : "Billing follows the product connection agreement."} Cost estimates are not available here yet. This request does not enable usage.</p>
      <Field label={`${product.name} setup type`}><Select value={mode} disabled={busy || submitted} onChange={event=>setMode(event.target.value as "provisioned" | "connected")}>{product.modes.map(value=><option key={value} value={value}>{value === "connected" ? "Connect existing organization" : "Create new organization"}</option>)}</Select></Field>
      {submitted ? <p role="status" className="t-body">Setup requested. Review configured applications for the next step; access is not confirmed.</p> : <Button disabled={busy} onClick={()=>void request()}>{busy ? "Requesting setup…" : `Set up ${product.name}`}</Button>}
      {error && <p role="alert" className="t-body text-critical-text">{error}</p>}
    </div>}
  </CardContent></Card>;
}
