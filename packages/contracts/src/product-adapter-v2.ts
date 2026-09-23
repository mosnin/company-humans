import { z } from "zod";
import { OrganizationIdSchema, ProductInstanceIdSchema, MembershipIdSchema } from "./ids.js";
import { PRODUCT_ADAPTER_METHODS, type AdapterResult, type ProductAdapterV1 } from "./product-adapter.js";

export const PRODUCT_ADAPTER_V2_CONTRACT_VERSION = 2 as const;
/** Remote membership must be unable to execute product operations or incur spend at creation. */
export const SuspendedMemberProvisionRequestSchema = z.object({
  organizationId: OrganizationIdSchema,
  productInstanceId: ProductInstanceIdSchema,
  membershipId: MembershipIdSchema,
  idempotencyKey: z.string().min(1).max(512),
  initialAccess: z.literal("suspended"),
}).strict();
export type SuspendedMemberProvisionRequest = z.infer<typeof SuspendedMemberProvisionRequestSchema>;

export interface SuspendedExternalMember {
  externalMemberId: string;
  status: "suspended";
}

/** V1 remains available for its existing operations; it cannot satisfy V2 member creation. */
export interface ProductAdapterV2 extends Omit<ProductAdapterV1, "contractVersion" | "provisionMember"> {
  readonly contractVersion: typeof PRODUCT_ADAPTER_V2_CONTRACT_VERSION;
  provisionMember(input: SuspendedMemberProvisionRequest): Promise<AdapterResult<SuspendedExternalMember>>;
}

export class IncompatibleMemberProvisioningAdapter extends Error {
  readonly code = "adapter_contract_incompatible";
  constructor() { super("Member provisioning requires the complete version 2 adapter contract"); }
}

/** Call before contacting a product. No silent V1 fallback is allowed. */
export function assertProductAdapterV2(value: unknown): asserts value is ProductAdapterV2 {
  if (typeof value !== "object" || value === null || !("contractVersion" in value) || value.contractVersion !== 2) {
    throw new IncompatibleMemberProvisioningAdapter();
  }
  for (const method of PRODUCT_ADAPTER_METHODS) {
    if (typeof (value as Record<string, unknown>)[method] !== "function") throw new IncompatibleMemberProvisioningAdapter();
  }
}

const Code = z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/);
/** A successful identity creation is still suspended; only later policy/readback gates may resume it. */
export const SuspendedMemberProvisionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("succeeded"), value: z.object({
    externalMemberId: z.string().min(1).max(512), status: z.literal("suspended"),
  }).strict() }).strict(),
  z.object({ status: z.literal("pending"), operationId: z.string().min(1).max(512) }).strict(),
  z.object({ status: z.literal("retryable_failure"), code: Code, retryAfterSeconds: z.number().int().min(1).max(86400).optional() }).strict(),
  z.object({ status: z.literal("permanent_failure"), code: Code }).strict(),
]);
