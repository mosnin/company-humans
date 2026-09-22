import { describe, it, expect } from 'vitest';
import { createCanonicalId } from './ids.js';
import { PRODUCT_ADAPTER_METHODS } from './product-adapter.js';
import { MemberAccessCommandSchema, MemberAccessOperationSchema, matchesMemberAccessCommand,
  assertProductMemberAccessAdapterV1, type MemberAccessCommand, type MemberAccessResult, type MemberAccessOperation } from './member-access-adapter.js';
import { verifyMemberAccessConformance } from './member-access-adapter.conformance.js';
function prepared() {
  const scope = { organizationId: createCanonicalId('organization'), productInstanceId: createCanonicalId('productInstance'), membershipId: createCanonicalId('membership') };
  const target = { externalOrganizationId: 'provider-org', externalMemberId: 'provider-member' };
  const command = MemberAccessCommandSchema.parse({ ...scope, target, schemaVersion: 1, accessRevision: 1, idempotencyKey: 'grant', access: 'active', policy: {
    capabilities: { ...scope, target, schemaVersion: 1, policyRevision: 1, capabilities: ['enrich'], mode: 'replace_all', memberAccess: 'suspended' },
    limits: [{ schemaVersion: 1, limit: { ...scope, schemaVersion: 1, usageLimitId: createCanonicalId('usageLimit'), meterKey: 'enrich', unit: 'credits', window: 'utc_month', revision: 1, maximumQuantity: '10' }, target, enforcement: 'hard_stop', accounting: 'preserve_accumulated_usage', scope: 'member' }],
  } });
  if (command.access === 'active') {
    const first = command.policy.limits[0]!;
    command.policy.limits.push({ ...first, limit: { ...first.limit, usageLimitId: createCanonicalId('usageLimit'), window: 'utc_day' } });
  }
  return command;
}
/** Test reference model only. It does not implement or simulate a deployed Scalar integration. */
function reference(initial: MemberAccessCommand, bug: 'replay' | 'execution' | 'capability' | 'quantity' | 'omission' | null = null) {
  let current: MemberAccessCommand | null = null;
  let held: string | null = null;
  const pending = new Map<string, MemberAccessCommand>();
  let releasing = false;
  const operations = new Map<string, MemberAccessCommand>();
  const adapter = {
    async setMemberAccess(command: MemberAccessCommand): Promise<MemberAccessResult> {
      command = MemberAccessCommandSchema.parse(command);
      const fail = (code: string): MemberAccessResult => ({ status: 'permanent_failure', code });
      if (command.target.externalMemberId !== initial.target.externalMemberId) return fail('binding_mismatch');
      const prior = operations.get(command.idempotencyKey);
      if (prior) {
        if (!matchesMemberAccessCommand(prior, command)) return fail('idempotency_conflict');
        if (bug === 'replay') current = command;
        return { status: 'succeeded', value: prior };
      }
      if (command.idempotencyKey === held && !releasing) { pending.set(command.idempotencyKey, command); return { status: 'pending', operationId: command.idempotencyKey }; }
      if (current && command.accessRevision <= current.accessRevision && !(releasing && bug === 'execution')) return fail('stale_revision');
      if (current?.access === 'removed') return fail('removed_binding');
      if (command.access === 'active') {
        if (initial.access !== 'active') return fail('policy_mismatch');
        const checked = structuredClone(command.policy);
        if (bug === 'capability') checked.capabilities.capabilities = initial.policy.capabilities.capabilities;
        if (bug === 'quantity') checked.limits = checked.limits.map(item => ({ ...item, limit: { ...item.limit,
          maximumQuantity: initial.policy.limits.find(expected => expected.limit.usageLimitId === item.limit.usageLimitId)?.limit.maximumQuantity ?? item.limit.maximumQuantity } }));
        if (bug === 'omission') {
          for (const item of initial.policy.limits) if (!checked.limits.some(value => value.limit.usageLimitId === item.limit.usageLimitId)) checked.limits.unshift(item);
        }
        if (JSON.stringify(checked) !== JSON.stringify(initial.policy)) return fail('policy_mismatch');
      }
      current = command; operations.set(command.idempotencyKey, command);
      return { status: 'succeeded', value: command };
    },
    async getMemberAccess(): Promise<MemberAccessResult> {
      return current ? { status: 'succeeded', value: current } : { status: 'permanent_failure', code: 'no_command' };
    },
    async getMemberAccessOperation(query: { idempotencyKey: string }): Promise<MemberAccessOperation> {
      if (pending.has(query.idempotencyKey)) return { status: 'pending', operationId: query.idempotencyKey };
      const value = operations.get(query.idempotencyKey);
      return value ? { status: 'applied', value } : { status: 'unknown' };
    },
  };
  const controls = {
    async holdExecution(command: MemberAccessCommand) { held = command.idempotencyKey; },
    async releaseExecution(command: MemberAccessCommand) {
      const queued = pending.get(command.idempotencyKey);
      if (!queued) throw new Error('No pending operation');
      releasing = true;
      try { return await adapter.setMemberAccess(queued); }
      finally { releasing = false; pending.delete(command.idempotencyKey); held = null; }
    },
  };
  return { adapter, controls };
}
describe('fenced member lifecycle extension', () => {
  it('runs a reusable provider conformance suite against a reference model', async () => {
    const activation = prepared();
    const fixture = reference(activation);
    expect(await verifyMemberAccessConformance(fixture.adapter, activation, fixture.controls)).toHaveLength(10);
  });
  it('detects providers that replay a historical grant after newer denial', async () => {
    const activation = prepared();
    const fixture = reference(activation, 'replay');
    await expect(verifyMemberAccessConformance(fixture.adapter, activation, fixture.controls)).rejects.toThrow('late activation cannot revive');
  });
  it.each([
    ['execution', 'outstanding grant rechecks fence'],
    ['capability', 'same revision capability content'],
    ['quantity', 'same revision limit content'],
    ['omission', 'complete applicable limit set'],
  ] as const)('detects defective provider enforcement: %s', async (bug, message) => {
    const activation = prepared(), fixture = reference(activation, bug);
    await expect(verifyMemberAccessConformance(fixture.adapter, activation, fixture.controls)).rejects.toThrow(message);
  });
  it('binds capability and limit policies to canonical and provider identities', () => {
    const c = prepared(); if (c.access !== 'active') throw new Error('fixture');
    for (const patch of [{ organizationId: createCanonicalId('organization') }, { membershipId: createCanonicalId('membership') }, { target: { ...c.target, externalMemberId: 'other' } }]) {
      expect(MemberAccessCommandSchema.safeParse({ ...c, ...patch }).success).toBe(false);
    }
    expect(MemberAccessCommandSchema.safeParse({ ...c, policy: { ...c.policy, limits: [] } }).success).toBe(false);
    expect(MemberAccessCommandSchema.safeParse({ ...c, policy: { ...c.policy, limits: [...c.policy.limits, ...c.policy.limits] } }).success).toBe(false);
    for (const accessRevision of [0, -1, 1.5, Infinity]) expect(MemberAccessCommandSchema.safeParse({ ...c, accessRevision }).success).toBe(false);
    expect(MemberAccessCommandSchema.safeParse({ ...c, access: 'suspended' }).success).toBe(false);
  });
  it('never treats an unknown or pending operation as an applied receipt', () => {
    for (const status of ['unknown', 'pending', 'applied']) {
      expect(MemberAccessOperationSchema.safeParse({ status }).success).toBe(status === 'unknown');
    }
    expect(MemberAccessOperationSchema.safeParse({ status: 'pending', operationId: 'remote-job' }).success).toBe(true);
    expect(MemberAccessOperationSchema.safeParse({ status: 'applied', value: prepared() }).success).toBe(true);
  });
  it('rejects legacy and incomplete registrations without invoking them', () => {
    const methods = [...PRODUCT_ADAPTER_METHODS, 'stageCapabilities', 'getStagedCapabilities', 'applyUsageLimit', 'getUsageLimitState', 'setMemberAccess', 'getMemberAccess', 'getMemberAccessOperation'];
    const adapter = { contractVersion: 2, capabilityContractVersion: 1, usageLimitContractVersion: 1, memberAccessContractVersion: 1,
      ...Object.fromEntries(methods.map(name => [name, () => { throw new Error('must not invoke'); }])) };
    expect(() => assertProductMemberAccessAdapterV1(adapter)).not.toThrow();
    for (const patch of [{ memberAccessContractVersion: undefined }, { contractVersion: 1 }, { usageLimitContractVersion: 0 }, { getMemberAccessOperation: undefined }]) {
      expect(() => assertProductMemberAccessAdapterV1({ ...adapter, ...patch })).toThrow('fenced member access');
    }
  });
});
