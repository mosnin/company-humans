import { createCanonicalId, MembershipIdSchema, OrganizationIdSchema, TeamIdSchema, UserIdSchema, type MembershipId, type OrganizationId, type TeamId, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { appendIdentityAudit } from "./identity-audit.js";

const CreateTeamSchema = z.object({
  actorUserId: UserIdSchema,
  organizationId: OrganizationIdSchema,
  name: z.string().trim().min(1).max(128),
}).strict();

async function requireTeamAdmin(client: Client, actorUserId: UserId, organizationId: OrganizationId): Promise<MembershipId> {
  const permission = await client.query<{ id: string }>(
    `SELECT m.id FROM public.memberships AS m JOIN public.organizations AS o ON o.id = m.organization_id
     WHERE m.user_id = $1 AND m.organization_id = $2 AND m.status = 'active'
       AND m.role_key IN ('owner', 'admin') AND o.status = 'active'`,
    [actorUserId, organizationId],
  );
  if (permission.rowCount !== 1) throw new Error("Team administration denied");
  return MembershipIdSchema.parse(permission.rows[0]!.id);
}

async function requireTeamAssignmentAuthority(
  client: Client, actorUserId: UserId, organizationId: OrganizationId, teamId: TeamId, teamRole: "manager" | "member",
): Promise<MembershipId> {
  const permission = await client.query<{ id: string; role_key: string; managed_team_id: string | null }>(
    `SELECT m.id, m.role_key, tm.team_id AS managed_team_id
     FROM public.memberships AS m
     JOIN public.organizations AS o ON o.id = m.organization_id AND o.status = 'active'
     JOIN public.teams AS t ON t.id = $3 AND t.organization_id = o.id AND t.status = 'active'
     LEFT JOIN public.team_memberships AS tm ON tm.membership_id = m.id
       AND tm.team_id = t.id AND tm.team_role = 'manager' AND tm.ended_at IS NULL
     WHERE m.user_id = $1 AND m.organization_id = $2 AND m.status = 'active'`,
    [actorUserId, organizationId, teamId],
  );
  const actor = permission.rows[0];
  if (!actor || (actor.role_key !== "owner" && actor.role_key !== "admin"
    && !(actor.role_key === "manager" && actor.managed_team_id === teamId && teamRole === "member"))) {
    throw new Error("Team assignment denied");
  }
  return MembershipIdSchema.parse(actor.id);
}

/** Narrow privileged mutation; the actor and target organization are checked in the same transaction. */
export async function createTeam(databaseUrl: string, input: z.input<typeof CreateTeamSchema>): Promise<TeamId> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const { actorUserId, organizationId, name } = CreateTeamSchema.parse(input);
  const teamId = createCanonicalId("team");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const actorMembershipId = await requireTeamAdmin(client, actorUserId, organizationId);
    await client.query("INSERT INTO public.teams (id, organization_id, name) VALUES ($1, $2, $3)", [teamId, organizationId, name]);
    await appendIdentityAudit(client, {
      organizationId, actorUserId, actorMembershipId,
      action: "team.created", targetType: "team", targetId: teamId,
      afterState: { name, status: "active" },
    });
    await client.query("COMMIT");
    return teamId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function assignTeamMember(databaseUrl: string, input: {
  actorUserId: UserId; organizationId: OrganizationId; teamId: TeamId; membershipId: MembershipId; teamRole: "manager" | "member";
}): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const actorUserId = UserIdSchema.parse(input.actorUserId);
  const organizationId = OrganizationIdSchema.parse(input.organizationId);
  const teamId = TeamIdSchema.parse(input.teamId);
  const membershipId = MembershipIdSchema.parse(input.membershipId);
  if (input.teamRole !== "manager" && input.teamRole !== "member") throw new Error("Invalid team role");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const actorMembershipId = await requireTeamAssignmentAuthority(client, actorUserId, organizationId, teamId, input.teamRole);
    const target = await client.query(
      `SELECT 1 FROM public.memberships WHERE id = $1 AND organization_id = $2 AND status = 'active'`,
      [membershipId, organizationId],
    );
    if (target.rowCount !== 1) throw new Error("Active team member in organization required");
    const previous = await client.query<{ team_role: string; ended_at: Date | null }>(
      `SELECT team_role, ended_at FROM public.team_memberships
       WHERE organization_id = $1 AND team_id = $2 AND membership_id = $3 FOR UPDATE`,
      [organizationId, teamId, membershipId],
    );
    await client.query(
      `INSERT INTO public.team_memberships (organization_id, team_id, membership_id, team_role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (team_id, membership_id) DO UPDATE SET team_role = EXCLUDED.team_role, ended_at = NULL`,
      [organizationId, teamId, membershipId, input.teamRole],
    );
    await appendIdentityAudit(client, {
      organizationId, actorUserId, actorMembershipId,
      action: "team.membership.assigned", targetType: "team_membership", targetId: `${teamId}:${membershipId}`,
      beforeState: previous.rows[0] ? { teamRole: previous.rows[0].team_role, endedAt: previous.rows[0].ended_at?.toISOString() ?? null } : undefined,
      afterState: { teamRole: input.teamRole, endedAt: null },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
