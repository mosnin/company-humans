import { CAPABILITIES, MembershipIdSchema, OrganizationIdSchema, RoleIdSchema, UserIdSchema } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { appendIdentityAudit } from "./identity-audit.js";
import { setServiceContext } from "./service-context.js";

export const SetRolePermissionsSchema = z.object({
  actorUserId: UserIdSchema,
  organizationId: OrganizationIdSchema,
  roleId: RoleIdSchema,
  capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
  expectedCapabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
}).strict();

export class RolePermissionError extends Error {
  constructor(public readonly kind: "denied" | "conflict") {
    super(kind === "conflict" ? "Role permissions changed; reload before saving" : "Role permission change denied");
  }
}

/** Replace a role policy atomically; require the caller's observed state to prevent lost edits. */
export async function setRolePermissions(databaseUrl: string, input: z.input<typeof SetRolePermissionsSchema>): Promise<void> {
  const parsed = SetRolePermissionsSchema.parse(input);
  const desired = [...new Set(parsed.capabilities)].sort();
  const expected = [...new Set(parsed.expectedCapabilities)].sort();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`role-policy:${parsed.organizationId}:${parsed.roleId}`]);
    const authority = await client.query<{ id: string }>(
      `SELECT m.id FROM public.memberships m WHERE m.organization_id = $1 AND m.user_id = $2
        AND company_human_private.can_edit_role($1,$3)
        AND NOT EXISTS (SELECT 1 FROM unnest($4::text[]) requested
          WHERE NOT company_human_private.has_capability($1,requested))`,
      [parsed.organizationId, parsed.actorUserId, parsed.roleId, desired],
    );
    if (!authority.rows[0]) throw new RolePermissionError("denied");
    const current = (await client.query<{ permission_key: string }>(
      "SELECT permission_key FROM public.role_permissions WHERE organization_id = $1 AND role_id = $2 ORDER BY permission_key",
      [parsed.organizationId, parsed.roleId],
    )).rows.map((row) => row.permission_key);
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new RolePermissionError("conflict");
    if (JSON.stringify(current) !== JSON.stringify(desired)) {
      await client.query("DELETE FROM public.role_permissions WHERE organization_id = $1 AND role_id = $2", [parsed.organizationId, parsed.roleId]);
      await client.query(
        "INSERT INTO public.role_permissions (organization_id,role_id,permission_key) SELECT $1,$2,key FROM unnest($3::text[]) key",
        [parsed.organizationId, parsed.roleId, desired],
      );
      await appendIdentityAudit(client, {
        organizationId: parsed.organizationId, actorUserId: parsed.actorUserId,
        actorMembershipId: MembershipIdSchema.parse(authority.rows[0].id),
        action: "role.permissions.changed", targetType: "role", targetId: parsed.roleId,
        beforeState: { capabilities: current }, afterState: { capabilities: desired },
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}
