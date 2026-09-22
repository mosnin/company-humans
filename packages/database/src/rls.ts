import { CAPABILITIES, MembershipIdSchema, OrganizationIdSchema, ROLE_KEYS, RoleIdSchema, TeamIdSchema, UserIdSchema, type Capability, type MembershipId, type OrganizationId, type RoleId, type RoleKey, type TeamId, type UserId } from "@company-human/contracts";
import { Client } from "pg";

/**
 * Each tenant read runs in a transaction with a locally scoped canonical user.
 * The connection role must be neither owner, superuser, nor BYPASSRLS.
 */
export interface VisibleOrganization {
  id: OrganizationId;
  name: string;
  slug: string;
  membershipId: string;
  roleKey: string;
}

async function withTenantContext<T>(databaseUrl: string, userId: UserId, query: (client: Client) => Promise<T>): Promise<T> {
  if (!databaseUrl) throw new Error("RLS database URL is required");
  UserIdSchema.parse(userId);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const role = await client.query<{ rolsuper: boolean; rolbypassrls: boolean; owns_table: boolean }>(
      `SELECT r.rolsuper, r.rolbypassrls,
              (SELECT pg_has_role(current_user, c.relowner, 'member') FROM pg_class c WHERE c.oid = 'public.organizations'::regclass) AS owns_table
       FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const state = role.rows[0];
    if (!state || state.rolsuper || state.rolbypassrls || state.owns_table) {
      throw new Error("Tenant query requires a nonprivileged RLS role");
    }
    await client.query("SELECT set_config('company_human.user_id', $1, true)", [userId]);
    const result = await query(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function listVisibleOrganizations(databaseUrl: string, userId: UserId): Promise<VisibleOrganization[]> {
  return withTenantContext(databaseUrl, userId, async (client) => {
    const result = await client.query<{ id: string; name: string; slug: string; membership_id: string; role_key: string }>(
      `SELECT o.id, o.name, o.slug, m.id AS membership_id, m.role_key
       FROM public.organizations AS o
       JOIN public.memberships AS m ON m.organization_id = o.id
       WHERE o.status = 'active' AND m.user_id = $1 AND m.status = 'active'
       ORDER BY o.name, o.id`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: OrganizationIdSchema.parse(row.id),
      name: row.name,
      slug: row.slug,
      membershipId: MembershipIdSchema.parse(row.membership_id),
      roleKey: row.role_key,
    }));
  });
}

export interface AccessContext {
  userId: UserId;
  organizationId: OrganizationId;
  membershipId: MembershipId;
  roleId: RoleId;
  roleKey: RoleKey;
  teamIds: TeamId[];
  capabilities: readonly Capability[];
}

export async function resolveAccessContext(databaseUrl: string, userId: UserId, organizationId: OrganizationId): Promise<AccessContext | null> {
  OrganizationIdSchema.parse(organizationId);
  return withTenantContext(databaseUrl, userId, async (client) => {
    const membership = await client.query<{ membership_id: string; role_id: string; role_key: string }>(
      `SELECT m.id AS membership_id, r.id AS role_id, r.key AS role_key
       FROM public.memberships AS m
       JOIN public.roles AS r ON r.organization_id = m.organization_id AND r.id = m.role_id AND r.key = m.role_key
       JOIN public.organizations AS o ON o.id = m.organization_id
       WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active' AND o.status = 'active'`,
      [organizationId, userId],
    );
    if (membership.rows.length !== 1) return null;
    const row = membership.rows[0]!;
    if (!ROLE_KEYS.includes(row.role_key as RoleKey)) throw new Error("Unknown organization role");
    const roleKey = row.role_key as RoleKey;
    const teams = await client.query<{ team_id: string }>(
      `SELECT tm.team_id FROM public.team_memberships AS tm
       JOIN public.teams AS t ON t.id = tm.team_id AND t.status = 'active'
       WHERE tm.organization_id = $1 AND tm.membership_id = $2 AND tm.ended_at IS NULL ORDER BY tm.team_id`,
      [organizationId, row.membership_id],
    );
    const granted = await client.query<{ permission_key: string }>(
      `SELECT rp.permission_key FROM public.role_permissions AS rp
       WHERE rp.organization_id = $1 AND rp.role_id = $2 ORDER BY rp.permission_key`,
      [organizationId, row.role_id],
    );
    const capabilities = granted.rows.map(({ permission_key }) => {
      if (!CAPABILITIES.includes(permission_key as Capability)) throw new Error("Unknown stored permission");
      return permission_key as Capability;
    });
    return {
      userId,
      organizationId,
      membershipId: MembershipIdSchema.parse(row.membership_id),
      roleId: RoleIdSchema.parse(row.role_id),
      roleKey,
      teamIds: teams.rows.map((team) => TeamIdSchema.parse(team.team_id)),
      capabilities,
    };
  });
}

export interface MemberApplication {
  id: string;
  name: string;
  instanceKey: string;
  status: "preparing" | "suspended" | "unavailable" | "access_check_required";
}

/** Own assignments only. Stored active state alone never authorizes a product launch. */
export async function listMemberApplications(databaseUrl: string, userId: UserId, organizationId: OrganizationId): Promise<MemberApplication[]> {
  OrganizationIdSchema.parse(organizationId);
  return withTenantContext(databaseUrl, userId, async client => {
    const result = await client.query<MemberApplication>(`SELECT pm.id, p.display_name AS name, i.instance_key AS "instanceKey",
      CASE WHEN NOT pm.desired_enabled OR NOT i.desired_enabled OR pm.provisioning_status='suspended'
          OR i.provisioning_status='suspended' THEN 'suspended'
        WHEN p.catalog_status='retired' OR pm.provisioning_status IN ('failed','removed')
          OR i.provisioning_status IN ('failed','disconnected') THEN 'unavailable'
        WHEN pm.provisioning_status='active' AND i.provisioning_status='active' THEN 'access_check_required'
        ELSE 'preparing' END AS status
      FROM public.product_memberships pm
      JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
      JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
      JOIN public.products p ON p.id=i.product_id
      WHERE pm.organization_id=$1 AND m.user_id=$2 AND m.status='active'
      ORDER BY p.display_name,i.instance_key,pm.id`, [organizationId,userId]);
    return result.rows;
  });
}
