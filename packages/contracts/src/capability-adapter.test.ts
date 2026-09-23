import { describe,it,expect } from 'vitest';
import { createCanonicalId } from './ids.js';
import { PRODUCT_ADAPTER_METHODS } from './product-adapter.js';
import { resolveRequestedCapabilities,StageCapabilitiesRequestSchema,CapabilityAdapterResultSchema,matchesStagedCapabilities,assertProductCapabilityAdapterV1 } from './capability-adapter.js';
const scope=()=>({organizationId:createCanonicalId('organization'),productInstanceId:createCanonicalId('productInstance'),membershipId:createCanonicalId('membership')});
const state=()=>({...scope(),schemaVersion:1 as const,policyRevision:2,capabilities:['read','write'],target:{externalOrganizationId:'org',externalMemberId:'member'},mode:'replace_all',memberAccess:'suspended'});
const adapter=()=>({contractVersion:2,capabilityContractVersion:1,...Object.fromEntries([...PRODUCT_ADAPTER_METHODS,'stageCapabilities','getStagedCapabilities'].map(name=>[name,async()=>({status:'permanent_failure',code:'fixture_only'})]))});
describe('capability staging contract',()=>{
 it('resolves explicit deny precedence, inheritance and default denial against the current catalog',()=>{
  const s=scope();
  const revision=(capability:string,effect:"allow"|"deny"|"inherit",member=false)=>({schemaVersion:1 as const,entitlementId:createCanonicalId('entitlement'),...s,membershipId:member?s.membershipId:null,capability,effect,revision:1});
  const revisions=[revision('read','allow'),revision('write','deny'),revision('write','allow',true),revision('export','allow'),revision('export','deny',true),revision('history','allow'),revision('history','inherit',true),revision('removed','allow'),revision('own','allow',true)];
  expect(resolveRequestedCapabilities({...s,supportedCapabilities:['write','read','export','history','missing','own'],revisions})).toEqual(['history','own','read']);
  expect(resolveRequestedCapabilities({...s,supportedCapabilities:['read'],revisions:[]})).toEqual([]);
 });
 it('rejects mixed tenant/member/instance and ambiguous revision snapshots',()=>{
  const s=scope(),r={schemaVersion:1 as const,entitlementId:createCanonicalId('entitlement'),...s,capability:'read',effect:'allow' as const,revision:1};
  for(const key of ['organizationId','productInstanceId','membershipId'] as const){const other=scope();expect(()=>resolveRequestedCapabilities({...s,supportedCapabilities:['read'],revisions:[{...r,[key]:other[key]}]})).toThrow('scope mismatch');}
  expect(()=>resolveRequestedCapabilities({...s,supportedCapabilities:['read'],revisions:[r,{...r,revision:2}]})).toThrow('Ambiguous');
  expect(()=>resolveRequestedCapabilities({...s,supportedCapabilities:['read'],revisions:[r,{...r,capability:'write'}]})).toThrow('Ambiguous');
 });
 it('requires complete replacement while suspended, accepts empty revocation, and rejects ambiguous input',()=>{
  const s=state();expect(StageCapabilitiesRequestSchema.safeParse({...s,capabilities:[],idempotencyKey:'one'}).success).toBe(true);
  for(const patch of [{memberAccess:'active'},{mode:'merge'},{policyRevision:0},{policyRevision:Number.MAX_SAFE_INTEGER+1},{capabilities:['read','read']},{capabilities:['*']},{target:{externalOrganizationId:'org'}},{unlimited:true}])expect(StageCapabilitiesRequestSchema.safeParse({...s,...patch,idempotencyKey:'one'}).success).toBe(false);
 });
 it('matches normalized sets but rejects extra or missing access, stale policy and all target substitutions',()=>{
  const s=state();expect(matchesStagedCapabilities(s,{...s,capabilities:['write','read']})).toBe(true);
  for(const patch of [{capabilities:['read']},{capabilities:['read','write','admin']},{policyRevision:1},{memberAccess:'active'},{mode:'merge'},{target:{...s.target,externalMemberId:'other'}},{target:{...s.target,externalOrganizationId:'other'}}])expect(matchesStagedCapabilities(s,{...s,...patch})).toBe(false);
  for(const key of ['organizationId','productInstanceId','membershipId'] as const)expect(matchesStagedCapabilities(s,{...s,[key]:scope()[key]})).toBe(false);
  expect(matchesStagedCapabilities({},s)).toBe(false);
 });
 it('rejects legacy or incomplete adapters before provider calls',()=>{
  expect(()=>assertProductCapabilityAdapterV1(adapter())).not.toThrow();
  for(const patch of [{contractVersion:1},{capabilityContractVersion:2},{stageCapabilities:undefined},{getStagedCapabilities:undefined},{resumeMember:undefined}])expect(()=>assertProductCapabilityAdapterV1({...adapter(),...patch})).toThrow('Capability staging');
 });
 it('keeps pending and failure results distinct from successful suspended readback',()=>{
  expect(CapabilityAdapterResultSchema.safeParse({status:'succeeded',value:state()}).success).toBe(true);
  for(const result of [{status:'pending',operationId:'job'},{status:'retryable_failure',code:'unavailable',retryAfterSeconds:30},{status:'permanent_failure',code:'unsupported'}])expect(CapabilityAdapterResultSchema.safeParse(result).success).toBe(true);
  for(const result of [{status:'succeeded',value:{...state(),memberAccess:'active'}},{status:'pending',operationId:''},{status:'retryable_failure',code:'secret token'},{status:'retryable_failure',code:'retry',retryAfterSeconds:0}])expect(CapabilityAdapterResultSchema.safeParse(result).success).toBe(false);
 });
});
