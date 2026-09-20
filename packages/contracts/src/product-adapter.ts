import type { MembershipId, OrganizationId, ProductInstanceId } from "./ids.js";

/** Version 1 boundary between Company Human and an independently owned product. */
export const PRODUCT_ADAPTER_CONTRACT_VERSION = 1 as const;

export type AdapterResult<T> =
  | { status: "succeeded"; value: T }
  | { status: "pending"; operationId: string }
  | { status: "retryable_failure"; code: string; retryAfterSeconds?: number }
  | { status: "permanent_failure"; code: string };

export interface AdapterRequest {
  organizationId: OrganizationId;
  productInstanceId: ProductInstanceId;
}

export interface AdapterMutation extends AdapterRequest {
  /** Stable across retries of one logical operation. */
  idempotencyKey: string;
}

export interface AdapterMemberRequest extends AdapterRequest {
  membershipId: MembershipId;
}

export interface AdapterMemberMutation extends AdapterMutation {
  membershipId: MembershipId;
}

export interface ExternalOrganization {
  externalOrganizationId: string;
  status: "active" | "suspended" | "disconnected";
}

export interface ExternalMember {
  externalMemberId: string;
  status: "active" | "suspended" | "removed";
}

export type AdapterHealthStatus =
  | "healthy"
  | "degraded"
  | "authentication_required"
  | "provisioning_failed"
  | "rate_limited"
  | "suspended"
  | "disconnected";

export interface AdapterHealth {
  status: AdapterHealthStatus;
  checkedAt: string;
  lastSuccessfulSyncAt?: string;
  lastFailureAt?: string;
  affectedMembers?: number;
  providerStatus?: string;
}

export interface AdapterMeter {
  key: string;
  unit: string;
}

export interface AdapterUsageEvent {
  sourceEventId: string;
  meterKey: string;
  quantity: number;
  occurredAt: string;
  membershipId?: MembershipId;
}

export interface AdapterUsageStatus {
  lastReportedAt?: string;
  reportingStatus: "healthy" | "delayed" | "unavailable";
}

export interface AdapterEntitlementState {
  capabilities: readonly string[];
  limits: Readonly<Record<string, number>>;
}

export interface ProductAdapterV1 {
  readonly contractVersion: typeof PRODUCT_ADAPTER_CONTRACT_VERSION;

  provisionOrganization(input: AdapterMutation): Promise<AdapterResult<ExternalOrganization>>;
  connectOrganization(input: AdapterMutation & { externalOrganizationId: string }): Promise<AdapterResult<ExternalOrganization>>;
  getOrganization(input: AdapterRequest): Promise<AdapterResult<ExternalOrganization>>;
  suspendOrganization(input: AdapterMutation): Promise<AdapterResult<ExternalOrganization>>;
  resumeOrganization(input: AdapterMutation): Promise<AdapterResult<ExternalOrganization>>;
  disconnectOrganization(input: AdapterMutation): Promise<AdapterResult<ExternalOrganization>>;
  getHealth(input: AdapterRequest): Promise<AdapterResult<AdapterHealth>>;

  provisionMember(input: AdapterMemberMutation): Promise<AdapterResult<ExternalMember>>;
  updateMember(input: AdapterMemberMutation): Promise<AdapterResult<ExternalMember>>;
  suspendMember(input: AdapterMemberMutation): Promise<AdapterResult<ExternalMember>>;
  resumeMember(input: AdapterMemberMutation): Promise<AdapterResult<ExternalMember>>;
  removeMember(input: AdapterMemberMutation): Promise<AdapterResult<ExternalMember>>;
  getMember(input: AdapterMemberRequest): Promise<AdapterResult<ExternalMember>>;

  applyEntitlements(input: AdapterMemberMutation & { capabilities: readonly string[] }): Promise<AdapterResult<AdapterEntitlementState>>;
  applyLimits(input: AdapterMemberMutation & { limits: Readonly<Record<string, number>> }): Promise<AdapterResult<AdapterEntitlementState>>;
  getEntitlementState(input: AdapterMemberRequest): Promise<AdapterResult<AdapterEntitlementState>>;

  listMeters(input: AdapterRequest): Promise<AdapterResult<readonly AdapterMeter[]>>;
  reportUsage(input: AdapterMutation & { events: readonly AdapterUsageEvent[] }): Promise<AdapterResult<{ acceptedSourceEventIds: readonly string[] }>>;
  getUsageStatus(input: AdapterRequest): Promise<AdapterResult<AdapterUsageStatus>>;

  getDeepLinks(input: AdapterMemberRequest): Promise<AdapterResult<Readonly<Record<string, string>>>>;
  getAvailableModules(input: AdapterMemberRequest): Promise<AdapterResult<readonly string[]>>;
}

export const PRODUCT_ADAPTER_METHODS = [
  "provisionOrganization", "connectOrganization", "getOrganization",
  "suspendOrganization", "resumeOrganization", "disconnectOrganization", "getHealth",
  "provisionMember", "updateMember", "suspendMember", "resumeMember", "removeMember", "getMember",
  "applyEntitlements", "applyLimits", "getEntitlementState",
  "listMeters", "reportUsage", "getUsageStatus", "getDeepLinks", "getAvailableModules",
] as const satisfies readonly (keyof ProductAdapterV1)[];

/** Reject incomplete or incompatible adapters before any provisioning call. */
export function assertProductAdapterV1(value: unknown): asserts value is ProductAdapterV1 {
  if (typeof value !== "object" || value === null || !("contractVersion" in value)
    || value.contractVersion !== PRODUCT_ADAPTER_CONTRACT_VERSION) {
    throw new Error("Unsupported product adapter contract version");
  }
  for (const method of PRODUCT_ADAPTER_METHODS) {
    if (typeof (value as Record<string, unknown>)[method] !== "function") {
      throw new Error(`Product adapter method unavailable: ${method}`);
    }
  }
}
