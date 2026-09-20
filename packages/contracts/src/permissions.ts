/** Initial organization roles from the Company Human identity doctrine. */
export const ROLE_KEYS = ["owner", "admin", "manager", "contributor", "finance", "developer"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const CAPABILITIES = [
  "organization.manage", "roles.manage", "members.manage", "teams.create", "teams.manage.assigned", "teams.manage.all", "applications.manage", "budgets.manage",
  "assignments.read.own", "assignments.read.team", "assignments.read.all",
  "assignments.manage.team", "assignments.manage.all",
  "crm.read.own", "crm.read.team", "crm.read.all", "crm.write.own", "crm.write.team", "crm.write.all",
  "earnings.read.own", "payouts.read.all", "billing.read.all",
  "usage.read.own", "usage.read.team", "usage.read.all",
  "context.read.approved", "context.policy.manage", "integrations.manage", "audit.read.all", "product.use",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const contributor = [
  "assignments.read.own", "crm.read.own", "crm.write.own", "earnings.read.own",
  "usage.read.own", "context.read.approved", "product.use",
] as const satisfies readonly Capability[];

const manager = [
  ...contributor, "assignments.read.team", "assignments.manage.team", "crm.read.team",
  "crm.write.team", "usage.read.team", "teams.manage.assigned",
] as const satisfies readonly Capability[];

const admin = [
  ...manager, "organization.manage", "roles.manage", "members.manage", "teams.create", "teams.manage.all", "applications.manage", "budgets.manage",
  "assignments.read.all", "assignments.manage.all", "crm.read.all", "crm.write.all",
  "usage.read.all", "context.policy.manage", "integrations.manage", "audit.read.all",
] as const satisfies readonly Capability[];

const finance = [
  "earnings.read.own", "payouts.read.all", "billing.read.all", "usage.read.all",
] as const satisfies readonly Capability[];

const developer = ["integrations.manage", "usage.read.own", "product.use"] as const satisfies readonly Capability[];

export const ROLE_CAPABILITIES: Readonly<Record<RoleKey, readonly Capability[]>> = {
  owner: CAPABILITIES,
  admin,
  manager,
  contributor,
  finance,
  developer,
};

export function roleHasCapability(role: RoleKey, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
