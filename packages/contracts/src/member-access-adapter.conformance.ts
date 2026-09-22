import { MemberAccessCommandSchema, MemberAccessResultSchema, MemberAccessOperationSchema,
  matchesMemberAccessCommand, type MemberAccessCommand, type MemberAccessResult, type ProductMemberAccessAdapterV1 } from './member-access-adapter.js';

export interface MemberAccessConformanceControls {
  /** Pause the provider execution immediately before its access-state mutation; admission alone must not apply it. */
  holdExecution(command: MemberAccessCommand): Promise<void>;
  /** Release the held provider job and observe terminal execution, after a newer denial has committed. */
  releaseExecution(command: MemberAccessCommand): Promise<MemberAccessResult>;
  settlePending?: (command: MemberAccessCommand) => Promise<MemberAccessResult>;
}

/** Destructive only within a dedicated test member. Caller prepares a fresh suspended binding with
 * the activation's capability/limit policy actually staged. Never run against a production member.
 * This runner intentionally uses public adapter methods so every provider can reuse the same checks.
 */
export async function verifyMemberAccessConformance(
  adapter: Pick<ProductMemberAccessAdapterV1, 'setMemberAccess' | 'getMemberAccess' | 'getMemberAccessOperation'>,
  preparedActivation: MemberAccessCommand,
  controls: MemberAccessConformanceControls,
): Promise<readonly string[]> {
  const activation = MemberAccessCommandSchema.parse(preparedActivation);
  if (activation.access !== 'active') throw new Error('Conformance requires a prepared activation');
  if (activation.policy.limits.length < 2 || activation.policy.capabilities.capabilities.length < 1) throw new Error('Conformance requires at least two applicable limits and one capability');
  const scope = { organizationId: activation.organizationId, productInstanceId: activation.productInstanceId,
    membershipId: activation.membershipId, target: activation.target };
  const completed: string[] = [];
  const check = (condition: boolean, name: string) => { if (!condition) throw new Error(`Member access conformance failed: ${name}`); };
  const apply = async (command: MemberAccessCommand) => {
    const response = MemberAccessResultSchema.parse(await adapter.setMemberAccess(command));
    if (response.status !== 'pending') return response;
    if (!controls.settlePending) throw new Error('Async conformance fixture must provide a bounded provider settlement observer');
    return MemberAccessResultSchema.parse(await controls.settlePending(command));
  };
  const observes = async (command: MemberAccessCommand) => {
    const result = MemberAccessResultSchema.parse(await adapter.getMemberAccess(scope));
    return result.status === 'succeeded' && matchesMemberAccessCommand(command, result.value);
  };
  const accepted = await apply(activation);
  check(accepted.status === 'succeeded' && await observes(activation), 'prepared activation');
  completed.push('prepared activation');
  let denial: MemberAccessCommand = { ...scope, schemaVersion: 1, accessRevision: activation.accessRevision + 1,
    idempotencyKey: `${activation.idempotencyKey}:deny`, access: 'suspended', policy: null };
  check((await apply(denial)).status === 'succeeded' && await observes(denial), 'newer denial');
  // Represents a previously sent activation arriving after the denial. A historical duplicate receipt
  // is permitted, but it must never replay its side effect or replace the current denial.
  await apply(activation);
  check(await observes(denial), 'late activation cannot revive access');
  completed.push('late activation cannot revive access');
  const outstanding = { ...activation, accessRevision: denial.accessRevision + 1, idempotencyKey: `${activation.idempotencyKey}:outstanding` };
  await controls.holdExecution(outstanding);
  const admitted = MemberAccessResultSchema.parse(await adapter.setMemberAccess(outstanding));
  check(admitted.status === 'pending' && await observes(denial), 'held grant is pending without access');
  const pending = MemberAccessOperationSchema.parse(await adapter.getMemberAccessOperation({ ...scope, idempotencyKey: outstanding.idempotencyKey }));
  check(pending.status === 'pending', 'durable pending operation');
  denial = { ...denial, accessRevision: outstanding.accessRevision + 1, idempotencyKey: `${activation.idempotencyKey}:newer-denial` };
  check((await apply(denial)).status === 'succeeded' && await observes(denial), 'denial commits while grant outstanding');
  const released = MemberAccessResultSchema.parse(await controls.releaseExecution(outstanding));
  check(released.status === 'permanent_failure' && await observes(denial), 'outstanding grant rechecks fence at execution');
  completed.push('outstanding grant rechecks fence at execution');
  const conflict = { ...activation, accessRevision: denial.accessRevision, idempotencyKey: `${activation.idempotencyKey}:conflict` };
  check((await apply(conflict)).status === 'permanent_failure' && await observes(denial), 'equal revision conflict');
  completed.push('equal revision conflict');
  const wrongPolicy = { ...activation, accessRevision: denial.accessRevision + 1, idempotencyKey: `${activation.idempotencyKey}:policy`,
    policy: { ...activation.policy, capabilities: { ...activation.policy.capabilities, policyRevision: activation.policy.capabilities.policyRevision + 1 } } };
  check((await apply(wrongPolicy)).status === 'permanent_failure' && await observes(denial), 'unstaged capability revision');
  const wrongLimit = { ...wrongPolicy, idempotencyKey: `${activation.idempotencyKey}:limit`, policy: { ...activation.policy,
    limits: activation.policy.limits.map((item, index) => index ? item : { ...item, limit: { ...item.limit, revision: item.limit.revision + 1 } }) } };
  check((await apply(wrongLimit)).status === 'permanent_failure' && await observes(denial), 'unstaged limit revision');
  completed.push('policy revision binding');
  const policyVariant = (suffix: string, policy: typeof activation.policy) => ({ ...activation,
    accessRevision: denial.accessRevision + 1, idempotencyKey: `${activation.idempotencyKey}:${suffix}`, policy });
  const wrongCapabilities = policyVariant('capability-content', { ...activation.policy,
    capabilities: { ...activation.policy.capabilities, capabilities: [] } });
  check((await apply(wrongCapabilities)).status === 'permanent_failure' && await observes(denial), 'same revision capability content');
  const wrongQuantity = policyVariant('limit-content', { ...activation.policy,
    limits: activation.policy.limits.map((item, index) => index ? item : { ...item, limit: { ...item.limit,
      maximumQuantity: item.limit.maximumQuantity === '0' ? '1' : '0' } }) });
  check((await apply(wrongQuantity)).status === 'permanent_failure' && await observes(denial), 'same revision limit content');
  const missingLimit = policyVariant('missing-limit', { ...activation.policy, limits: activation.policy.limits.slice(1) });
  check((await apply(missingLimit)).status === 'permanent_failure' && await observes(denial), 'complete applicable limit set');
  completed.push('policy content and completeness');
  const substitutedTarget = { ...activation.target, externalMemberId: `${activation.target.externalMemberId}:other` };
  const substituted = { ...activation, target: substitutedTarget, accessRevision: denial.accessRevision + 1,
    idempotencyKey: `${activation.idempotencyKey}:binding`, policy: { ...activation.policy,
      capabilities: { ...activation.policy.capabilities, target: substitutedTarget },
      limits: activation.policy.limits.map(item => item.limit.membershipId === null ? item : { ...item, target: substitutedTarget }) } };
  check((await apply(substituted)).status === 'permanent_failure' && await observes(denial), 'provider identity binding');
  completed.push('provider identity binding');
  const unknown = MemberAccessOperationSchema.parse(await adapter.getMemberAccessOperation({ ...scope, idempotencyKey: `${activation.idempotencyKey}:unknown` }));
  check(unknown.status === 'unknown', 'unknown operation is not success');
  // Discard the mutation response to model a lost response after the provider committed.
  const resumed = { ...activation, accessRevision: denial.accessRevision + 2, idempotencyKey: `${activation.idempotencyKey}:resume` };
  await apply(resumed);
  const reconciled = MemberAccessOperationSchema.parse(await adapter.getMemberAccessOperation({ ...scope, idempotencyKey: resumed.idempotencyKey }));
  check(reconciled.status === 'applied' && matchesMemberAccessCommand(resumed, reconciled.value) && await observes(resumed), 'lost response reconciliation');
  check((await apply(resumed)).status === 'succeeded' && await observes(resumed), 'identical retry');
  completed.push('lost response reconciliation');
  const reusedKey = { ...denial, accessRevision: resumed.accessRevision + 1, idempotencyKey: resumed.idempotencyKey };
  check((await apply(reusedKey)).status === 'permanent_failure' && await observes(resumed), 'idempotency conflict');
  completed.push('idempotency conflict');
  const removed: MemberAccessCommand = { ...denial, access: 'removed', accessRevision: resumed.accessRevision + 2, idempotencyKey: `${activation.idempotencyKey}:remove` };
  check((await apply(removed)).status === 'succeeded', 'removal');
  check((await apply({ ...activation, accessRevision: removed.accessRevision + 1, idempotencyKey: `${activation.idempotencyKey}:revive` })).status === 'permanent_failure'
    && await observes(removed), 'removed binding cannot be revived');
  completed.push('removed binding cannot be revived');
  return completed;
}
