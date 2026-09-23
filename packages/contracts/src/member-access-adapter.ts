import { z } from 'zod';
import { OrganizationIdSchema, ProductInstanceIdSchema, MembershipIdSchema } from './ids.js';
import { StagedCapabilitiesStateSchema, assertProductCapabilityAdapterV1, type ProductCapabilityAdapterV1 } from './capability-adapter.js';
import { AppliedUsageLimitStateSchema, assertProductUsageLimitAdapterV1, type ProductUsageLimitAdapterV1 } from './usage-limit-adapter.js';

export const MEMBER_ACCESS_ADAPTER_VERSION = 1 as const;
const ExternalId = z.string().min(1).max(512);
const Scope = z.object({
  organizationId: OrganizationIdSchema, productInstanceId: ProductInstanceIdSchema, membershipId: MembershipIdSchema,
  target: z.object({ externalOrganizationId: ExternalId, externalMemberId: ExternalId }).strict(),
}).strict();
export const MemberAccessScopeSchema = Scope;
const Command = Scope.extend({
  schemaVersion: z.literal(1), accessRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: ExternalId,
});
const Policy = z.object({
  capabilities: StagedCapabilitiesStateSchema,
  // Callers must include the complete current applicable limit set, with coverage for every enabled expensive meter.
  limits: z.array(AppliedUsageLimitStateSchema).min(1).max(2000),
}).strict();
export const MemberAccessCommandSchema = z.discriminatedUnion('access', [
  Command.extend({ access: z.literal('active'), policy: Policy }).strict(),
  Command.extend({ access: z.enum(['suspended', 'removed']), policy: z.null() }).strict(),
]).superRefine((value, ctx) => {
  if (value.access !== 'active') return;
  const cap = value.policy.capabilities;
  if (cap.organizationId !== value.organizationId || cap.productInstanceId !== value.productInstanceId
    || cap.membershipId !== value.membershipId || cap.target.externalOrganizationId !== value.target.externalOrganizationId
    || cap.target.externalMemberId !== value.target.externalMemberId) {
    ctx.addIssue({ code: 'custom', message: 'Capability policy binding mismatch' });
  }
  const ids = new Set<string>();
  const scopes = new Set<string>();
  for (const item of value.policy.limits) {
    const l = item.limit;
    const key = JSON.stringify([l.membershipId, l.meterKey, l.window]);
    if (ids.has(l.usageLimitId) || scopes.has(key)) ctx.addIssue({ code: 'custom', message: 'Duplicate limit policy' });
    ids.add(l.usageLimitId); scopes.add(key);
    if (l.organizationId !== value.organizationId || l.productInstanceId !== value.productInstanceId
      || (l.membershipId !== null && l.membershipId !== value.membershipId)
      || item.target.externalOrganizationId !== value.target.externalOrganizationId
      || (l.membershipId !== null && item.target.externalMemberId !== value.target.externalMemberId)) {
      ctx.addIssue({ code: 'custom', message: 'Usage limit policy binding mismatch' });
    }
  }
});
export type MemberAccessCommand = z.infer<typeof MemberAccessCommandSchema>;
export type MemberAccessScope = z.infer<typeof Scope>;
const Code = z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/);
export const MemberAccessResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('succeeded'), value: MemberAccessCommandSchema }).strict(),
  z.object({ status: z.literal('pending'), operationId: ExternalId }).strict(),
  z.object({ status: z.literal('retryable_failure'), code: Code }).strict(),
  z.object({ status: z.literal('permanent_failure'), code: Code }).strict(),
]);
export type MemberAccessResult = z.infer<typeof MemberAccessResultSchema>;
export const MemberAccessOperationQuerySchema = Scope.extend({ idempotencyKey: ExternalId }).strict();
export type MemberAccessOperationQuery = z.infer<typeof MemberAccessOperationQuerySchema>;
export const MemberAccessOperationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unknown') }).strict(),
  z.object({ status: z.literal('pending'), operationId: ExternalId }).strict(),
  z.object({ status: z.literal('applied'), value: MemberAccessCommandSchema }).strict(),
  z.object({ status: z.literal('rejected'), code: Code }).strict(),
]);
export type MemberAccessOperation = z.infer<typeof MemberAccessOperationSchema>;

/** Additive extension. A registration must use this boundary for BOTH grants and denials.
 * Provider responsibilities, atomically at the actual access/spend boundary:
 * - Bind canonical identities to the exact provider identities; never trust a caller-supplied remapping.
 * - Apply monotonically increasing accessRevision. Reject lower revisions, equal revisions with different
 *   contents, and idempotency-key reuse with different contents. A duplicate must not reapply old access.
 * - Activation compares the complete staged capability and applicable finite limit set against actual
 *   provider state in the same transaction as enabling access. Missing/stale policy denies activation.
 * - Suspension/removal never require policy availability. Preserve usage counters and domain data.
 * - Removal is terminal for that binding; restoration requires separately authorized reprovisioning.
 * - Persist operation identity before asynchronous work; delayed work must recheck the revision fence
 *   at execution time. A timeout is not cancellation. Do not let legacy mutations bypass this fence.
 * Readback methods read durable provider state. An operation receipt is historical, not current access.
 */
export interface ProductMemberAccessAdapterV1 extends ProductCapabilityAdapterV1, ProductUsageLimitAdapterV1 {
  readonly memberAccessContractVersion: typeof MEMBER_ACCESS_ADAPTER_VERSION;
  setMemberAccess(input: MemberAccessCommand): Promise<MemberAccessResult>;
  getMemberAccess(input: MemberAccessScope): Promise<MemberAccessResult>;
  /** Unknown means no durable receipt was found, NOT proof that the request cannot arrive later.
   * Retry only the identical command/key, or supersede with a newer fenced denial. Never invent a new grant.
   */
  getMemberAccessOperation(input: MemberAccessOperationQuery): Promise<MemberAccessOperation>;
}
export class IncompatibleMemberAccessAdapter extends Error {
  readonly code = 'member_access_contract_incompatible';
  constructor() { super('Member activation requires fenced member access adapter version 1'); }
}
export function assertProductMemberAccessAdapterV1(value: unknown): asserts value is ProductMemberAccessAdapterV1 {
  try { assertProductCapabilityAdapterV1(value); assertProductUsageLimitAdapterV1(value); }
  catch { throw new IncompatibleMemberAccessAdapter(); }
  const adapter = value as unknown as Record<string, unknown>;
  if (adapter.memberAccessContractVersion !== 1 || ['setMemberAccess', 'getMemberAccess', 'getMemberAccessOperation']
    .some(method => typeof adapter[method] !== 'function')) throw new IncompatibleMemberAccessAdapter();
}
/** Exact binding/revision/content comparison, not authorization or proof of provider enforcement. */
export function matchesMemberAccessCommand(expected: unknown, observed: unknown): boolean {
  const a = MemberAccessCommandSchema.safeParse(expected), b = MemberAccessCommandSchema.safeParse(observed);
  if (!a.success || !b.success) return false;
  const normalized = (command: MemberAccessCommand) => ({ ...command, policy: command.access === 'active'
    ? { ...command.policy, limits: [...command.policy.limits].sort((x, y) => x.limit.usageLimitId.localeCompare(y.limit.usageLimitId)) }
    : null });
  return JSON.stringify(normalized(a.data)) === JSON.stringify(normalized(b.data));
}
