import { OrganizationIdSchema, UserIdSchema } from "@company-human/contracts";
import type { Client } from "pg";

async function assertServiceConnection(client: Client): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const result = await client.query<{ allowed: boolean }>(
    `SELECT pg_has_role(current_user, 'company_human_service', 'member')
      AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND (SELECT NOT pg_has_role(current_user, c.relowner, 'member') FROM pg_class AS c WHERE c.oid = 'public.organizations'::regclass) AS allowed
     FROM pg_roles AS r WHERE r.rolname = current_user`,
  );
  if (!result.rows[0]?.allowed) throw new Error("Tenant mutations require a restricted service role");
}

/** Must run inside the mutation transaction, after verified actor resolution. */
export async function setServiceContext(client: Client, actorUserId: string, organizationId: string, invitationHash?: string): Promise<void> {
  await assertServiceConnection(client);
  const actor = UserIdSchema.parse(actorUserId);
  const organization = OrganizationIdSchema.parse(organizationId);
  await client.query("SELECT set_config('company_human.user_id', $1, true), set_config('company_human.organization_id', $2, true)",
    [actor, organization]);
  if (invitationHash) {
    await client.query("SELECT set_config('company_human.invitation_hash', $1, true)", [invitationHash]);
  }
}

export async function setInvitationActorContext(client: Client, actorUserId: string, invitationHash: string, verifiedEmail: string): Promise<string> {
  await assertServiceConnection(client);
  const actor = UserIdSchema.parse(actorUserId);
  if (!/^[0-9a-f]{64}$/.test(invitationHash)) throw new Error("Invalid invitation hash");
  await client.query("SELECT set_config('company_human.user_id', $1, true), set_config('company_human.invitation_hash', $2, true), set_config('company_human.verified_email', $3, true)",
    [actor, invitationHash, verifiedEmail]);
  const result = await client.query<{ organization_id: string | null }>(
    "SELECT company_human_private.invitation_organization_for_actor($1) AS organization_id", [invitationHash],
  );
  if (!result.rows[0]?.organization_id) throw new Error("Invitation unavailable");
  const organizationId = OrganizationIdSchema.parse(result.rows[0].organization_id);
  await client.query("SELECT set_config('company_human.organization_id', $1, true)", [organizationId]);
  return organizationId;
}
