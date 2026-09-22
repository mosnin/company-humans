import { MembershipIdSchema, OrganizationIdSchema, ROLE_KEYS, UserIdSchema, type MembershipId, type OrganizationId, type RoleKey, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { appendIdentityAudit } from "./identity-audit.js";
import { setServiceContext } from "./service-context.js";

async function requireAdmin(client: Client, userId: UserId, organizationId: OrganizationId, capability: "organization.manage" | "members.manage"): Promise<{ id: MembershipId; roleKey: RoleKey }> {
  const result = await client.query<{ id: string; role_key: RoleKey }>(
    `SELECT m.id, m.role_key FROM public.memberships AS m
     JOIN public.organizations AS o ON o.id = m.organization_id
     WHERE m.user_id = $1 AND m.organization_id = $2 AND m.status = 'active'
       AND o.status = 'active'
       AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = m.user_id AND u.status = 'active')
       AND EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.organization_id = m.organization_id
         AND rp.role_id = m.role_id AND rp.permission_key = $3)`,
    [userId, organizationId, capability],
  );
  if (result.rowCount !== 1) throw new Error("Organization administration denied");
  return { id: MembershipIdSchema.parse(result.rows[0]!.id), roleKey: result.rows[0]!.role_key };
}

export async function renameOrganization(databaseUrl: string, input: { actorUserId: string; organizationId: string; name: string }): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const actorUserId = UserIdSchema.parse(input.actorUserId);
  const organizationId = OrganizationIdSchema.parse(input.organizationId);
  const name = z.string().trim().min(1).max(256).parse(input.name);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, actorUserId, organizationId);
    const actor = await requireAdmin(client, actorUserId, organizationId, "organization.manage");
    const old = await client.query<{ name: string }>("SELECT name FROM public.organizations WHERE id = $1 FOR UPDATE", [organizationId]);
    if (!old.rows[0]) throw new Error("Organization unavailable");
    if (old.rows[0].name !== name) {
      await client.query("UPDATE public.organizations SET name = $1, updated_at = now() WHERE id = $2", [name, organizationId]);
      await appendIdentityAudit(client, {
        organizationId, actorUserId, actorMembershipId: actor.id,
        action: "organization.renamed", targetType: "organization", targetId: organizationId,
        beforeState: { name: old.rows[0].name }, afterState: { name },
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function changeMembershipRole(databaseUrl: string, input: {
  actorUserId: string; organizationId: string; membershipId: string; roleKey: string;
}): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const actorUserId = UserIdSchema.parse(input.actorUserId);
  const organizationId = OrganizationIdSchema.parse(input.organizationId);
  const membershipId = MembershipIdSchema.parse(input.membershipId);
  if (!ROLE_KEYS.includes(input.roleKey as RoleKey) || input.roleKey === "owner") throw new Error("Invalid target role");
  const roleKey = input.roleKey as RoleKey;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, actorUserId, organizationId);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`product-authorization:${organizationId}`]);
    const actor = await requireAdmin(client, actorUserId, organizationId, "members.manage");
    const target = await client.query<{ user_id: string; role_key: RoleKey; status: string }>(
      "SELECT user_id, role_key, status FROM public.memberships WHERE id = $1 AND organization_id = $2 FOR UPDATE",
      [membershipId, organizationId],
    );
    const member = target.rows[0];
    if (!member || member.status !== "active" || member.role_key === "owner" || member.user_id === actorUserId
      || (actor.roleKey !== "owner" && (member.role_key === "admin" || roleKey === "admin"))) {
      throw new Error("Role change denied");
    }
    if (member.role_key !== roleKey) {
      await client.query("UPDATE public.memberships SET role_key = $1, updated_at = now() WHERE id = $2", [roleKey, membershipId]);
      await appendIdentityAudit(client, {
        organizationId, actorUserId, actorMembershipId: actor.id,
        action: "membership.role.changed", targetType: "membership", targetId: membershipId,
        beforeState: { roleKey: member.role_key }, afterState: { roleKey },
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
