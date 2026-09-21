import { z } from 'zod';
import { OrganizationIdSchema, ProductInstanceIdSchema, MembershipIdSchema } from './ids.js';
import { ProductCapabilityKeySchema, EntitlementRevisionV1Schema, requestedEntitlementEffect } from './entitlements.js';
import { assertProductAdapterV2, type ProductAdapterV2 } from './product-adapter-v2.js';
import type { AdapterResult } from './product-adapter.js';

const Capabilities=z.array(ProductCapabilityKeySchema).max(1000)
  .refine(values=>new Set(values).size===values.length,{message:'Duplicate capabilities'})
  .transform(values=>[...values].sort());
const Scope=z.object({organizationId:OrganizationIdSchema,productInstanceId:ProductInstanceIdSchema,membershipId:MembershipIdSchema}).strict();
const Configuration=Scope.extend({supportedCapabilities:Capabilities,revisions:z.array(EntitlementRevisionV1Schema).max(2000)}).strict();
/** Desired configuration only. This never authorizes work or replaces runtime policy gates. */
export function resolveRequestedCapabilities(input:z.input<typeof Configuration>):string[]{
  const parsed=Configuration.parse(input),byScope=new Map<string,z.infer<typeof EntitlementRevisionV1Schema>>(),ids=new Set<string>();
  for(const revision of parsed.revisions){
    if(revision.organizationId!==parsed.organizationId||revision.productInstanceId!==parsed.productInstanceId
      ||(revision.membershipId!==null&&revision.membershipId!==parsed.membershipId))throw new Error('Entitlement scope mismatch');
    const key=JSON.stringify([revision.membershipId,revision.capability]);
    if(byScope.has(key)||ids.has(revision.entitlementId))throw new Error('Ambiguous entitlement snapshot');
    byScope.set(key,revision);ids.add(revision.entitlementId);
  }
  // Retired capabilities never survive via a historical allow. Only the current catalog is eligible.
  return parsed.supportedCapabilities.filter(capability=>requestedEntitlementEffect(
    byScope.get(JSON.stringify([null,capability]))?.effect??null,
    byScope.get(JSON.stringify([parsed.membershipId,capability]))?.effect??null)==='allow');
}

export const CAPABILITY_ADAPTER_VERSION=1 as const;
const ExternalId=z.string().min(1).max(512);
const State=Scope.extend({schemaVersion:z.literal(1),
  // Monotonic revision of a complete member capability snapshot, not an individual preference revision.
  policyRevision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  capabilities:Capabilities,
  target:z.object({externalOrganizationId:ExternalId,externalMemberId:ExternalId}).strict(),
  mode:z.literal('replace_all'),memberAccess:z.literal('suspended'),
}).strict();
export const StagedCapabilitiesStateSchema=State;
export const StageCapabilitiesRequestSchema=State.extend({idempotencyKey:z.string().min(1).max(512)}).strict();
export type StagedCapabilitiesState=z.infer<typeof State>;
export type StageCapabilitiesRequest=z.infer<typeof StageCapabilitiesRequestSchema>;
const Code=z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/);
export const CapabilityAdapterResultSchema=z.discriminatedUnion('status',[
  z.object({status:z.literal('succeeded'),value:State}).strict(),
  z.object({status:z.literal('pending'),operationId:ExternalId}).strict(),
  z.object({status:z.literal('retryable_failure'),code:Code,retryAfterSeconds:z.number().int().min(1).max(86400).optional()}).strict(),
  z.object({status:z.literal('permanent_failure'),code:Code}).strict(),
]);
/** Stages a complete capability set without resuming the member or resetting usage limits/counters. */
export interface ProductCapabilityAdapterV1 extends ProductAdapterV2 {
  readonly capabilityContractVersion:typeof CAPABILITY_ADAPTER_VERSION;
  /** Replace, never merge. Reject stale revisions and equal revisions with different contents. */
  stageCapabilities(input:StageCapabilitiesRequest):Promise<AdapterResult<StagedCapabilitiesState>>;
  /** Read actual provider state. Echoing an input is not readback evidence. */
  getStagedCapabilities(input:StagedCapabilitiesState):Promise<AdapterResult<StagedCapabilitiesState>>;
}
export class IncompatibleCapabilityAdapter extends Error {
  readonly code='capability_contract_incompatible';
  constructor(){super('Capability staging requires capability adapter extension version 1');}
}
export function assertProductCapabilityAdapterV1(value:unknown):asserts value is ProductCapabilityAdapterV1 {
  try{assertProductAdapterV2(value);}catch{throw new IncompatibleCapabilityAdapter();}
  const adapter=value as unknown as Record<string,unknown>;
  if(adapter.capabilityContractVersion!==1||typeof adapter.stageCapabilities!=='function'||typeof adapter.getStagedCapabilities!=='function')throw new IncompatibleCapabilityAdapter();
}
/** Exact snapshot/identity comparison; a match alone does not authorize activation or prove enforcement. */
export function matchesStagedCapabilities(expected:unknown,observed:unknown):boolean {
  const a=State.safeParse(expected),b=State.safeParse(observed);if(!a.success||!b.success)return false;
  return a.data.organizationId===b.data.organizationId&&a.data.productInstanceId===b.data.productInstanceId
    &&a.data.membershipId===b.data.membershipId&&a.data.policyRevision===b.data.policyRevision
    &&a.data.target.externalOrganizationId===b.data.target.externalOrganizationId&&a.data.target.externalMemberId===b.data.target.externalMemberId
    &&JSON.stringify(a.data.capabilities)===JSON.stringify(b.data.capabilities);
}
