import { z } from "zod";
import type { AdapterHealth } from "./product-adapter.js";

export const AdapterHealthStatusSchema = z.enum([
  "healthy", "degraded", "authentication_required", "provisioning_failed",
  "rate_limited", "suspended", "disconnected",
]);
const Timestamp = z.iso.datetime({ offset: true });
/** Runtime validation of the existing getHealth success value; no adapter version change. */
export const AdapterHealthSchema = z.object({
  status: AdapterHealthStatusSchema,
  checkedAt: Timestamp,
  lastSuccessfulSyncAt: Timestamp.optional(),
  lastFailureAt: Timestamp.optional(),
  affectedMembers: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  providerStatus: z.string().max(512).optional(),
}).strict().superRefine((value, context) => {
  for (const field of ["lastSuccessfulSyncAt", "lastFailureAt"] as const) {
    if (value[field] && Date.parse(value[field]) > Date.parse(value.checkedAt)) {
      context.addIssue({code:"custom",path:[field],message:"Health history cannot follow its observation"});
    }
  }
});

export interface HealthObservation {
  status: AdapterHealth["status"];
  checkedAt: string;
  lastSuccessfulSyncAt: string | null;
  lastFailureAt: string | null;
  affectedMembers: number | null;
}
export type HealthAssessment =
  | { state: "unknown"; reason: "missing_observation" | "invalid_observation" | "future_observation" }
  | { state: "stale"; observation: HealthObservation }
  | { state: "current"; observation: HealthObservation };

/**
 * Freshness is evaluated against the trusted collector/reader clock, never a
 * provider-controlled expiry. Caller supplies its explicit polling policy.
 * Historical healthy is not current health or authorization to use a product.
 * Provider free text is deliberately excluded from this public projection.
 */
export function assessAdapterHealth(raw: unknown, now: Date, maximumAgeMs: number): HealthAssessment {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0) {
    throw new Error("Health freshness requires a valid clock and positive bounded age");
  }
  if (raw === null || raw === undefined) return {state:"unknown",reason:"missing_observation"};
  const parsed = AdapterHealthSchema.safeParse(raw);
  if (!parsed.success) return {state:"unknown",reason:"invalid_observation"};
  const health = parsed.data;
  const age = now.getTime() - Date.parse(health.checkedAt);
  if (age < 0) return {state:"unknown",reason:"future_observation"};
  const observation: HealthObservation = {
    status:health.status, checkedAt:health.checkedAt,
    lastSuccessfulSyncAt:health.lastSuccessfulSyncAt ?? null,
    lastFailureAt:health.lastFailureAt ?? null,
    affectedMembers:health.affectedMembers ?? null,
  };
  return {state:age >= maximumAgeMs ? "stale" : "current",observation};
}
