import { MembershipIdSchema, OrganizationIdSchema, UserIdSchema, type OrganizationId, type UserId } from "@company-human/contracts";
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

export async function listVisibleOrganizations(databaseUrl: string, userId: UserId): Promise<VisibleOrganization[]> {
  if (!databaseUrl) throw new Error("RLS database URL is required");
  UserIdSchema.parse(userId);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const role = await client.query<{ rolsuper: boolean; rolbypassrls: boolean; owns_table: boolean }>(
      `SELECT r.rolsuper, r.rolbypassrls,
              (SELECT c.relowner = r.oid FROM pg_class c WHERE c.oid = 'public.organizations'::regclass) AS owns_table
       FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const state = role.rows[0];
    if (!state || state.rolsuper || state.rolbypassrls || state.owns_table) {
      throw new Error("Tenant query requires a nonprivileged RLS role");
    }
    await client.query("SELECT set_config('company_human.user_id', $1, true)", [userId]);
    const result = await client.query<{ id: string; name: string; slug: string; membership_id: string; role_key: string }>(
      `SELECT o.id, o.name, o.slug, m.id AS membership_id, m.role_key
       FROM public.organizations AS o
       JOIN public.memberships AS m ON m.organization_id = o.id
       WHERE o.status = 'active' AND m.user_id = $1 AND m.status = 'active'
       ORDER BY o.name, o.id`,
      [userId],
    );
    await client.query("COMMIT");
    return result.rows.map((row) => ({
      id: OrganizationIdSchema.parse(row.id),
      name: row.name,
      slug: row.slug,
      membershipId: MembershipIdSchema.parse(row.membership_id),
      roleKey: row.role_key,
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
