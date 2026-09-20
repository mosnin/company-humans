import { createHash, randomBytes } from "node:crypto";
import { createCanonicalId, MembershipIdSchema, OrganizationIdSchema, UserIdSchema, type InvitationId, type MembershipId, type OrganizationId, type RoleKey, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { appendIdentityAudit } from "./identity-audit.js";

const InviteSchema = z.object({
  actorUserId: UserIdSchema,
  organizationId: OrganizationIdSchema,
  recipientEmail: z.email().transform((value) => value.trim().toLowerCase()),
  roleKey: z.enum(["admin", "manager", "contributor", "finance", "developer"]),
  expiresAt: z.date().refine((date) => date.getTime() > Date.now(), "Invitation must expire in the future"),
}).strict();

async function requireMembershipAdmin(client: Client, actorUserId: UserId, organizationId: OrganizationId): Promise<{ roleKey: RoleKey; membershipId: MembershipId }> {
  const result = await client.query<{ id: string; role_key: RoleKey }>(
    `SELECT m.id, m.role_key FROM public.memberships AS m
     JOIN public.organizations AS o ON o.id = m.organization_id
     WHERE m.user_id = $1 AND m.organization_id = $2 AND m.status = 'active'
       AND m.role_key IN ('owner', 'admin') AND o.status = 'active'`,
    [actorUserId, organizationId],
  );
  if (result.rowCount !== 1) throw new Error("Membership administration denied");
  return { roleKey: result.rows[0]!.role_key, membershipId: MembershipIdSchema.parse(result.rows[0]!.id) };
}

export async function inviteMember(databaseUrl: string, input: z.input<typeof InviteSchema>): Promise<{ invitationId: InvitationId; token: string }> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const parsed = InviteSchema.parse(input);
  const invitationId = createCanonicalId("invitation");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const actor = await requireMembershipAdmin(client, parsed.actorUserId, parsed.organizationId);
    if (parsed.roleKey === "admin" && actor.roleKey !== "owner") throw new Error("Only owner can invite an admin");
    const expired = await client.query<{ id: string }>(
      `UPDATE public.membership_invitations SET status = 'expired'
       WHERE organization_id = $1 AND recipient_email = $2 AND status = 'pending' AND expires_at <= now()
       RETURNING id`,
      [parsed.organizationId, parsed.recipientEmail],
    );
    for (const previous of expired.rows) {
      await appendIdentityAudit(client, {
        organizationId: parsed.organizationId, actorUserId: parsed.actorUserId, actorMembershipId: actor.membershipId,
        action: "invitation.expired", targetType: "invitation", targetId: previous.id,
        beforeState: { status: "pending" }, afterState: { status: "expired" },
      });
    }
    const existing = await client.query(
      `SELECT 1 FROM public.memberships AS m JOIN public.users AS u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND lower(u.primary_email) = $2 AND m.status IN ('active', 'suspended')`,
      [parsed.organizationId, parsed.recipientEmail],
    );
    if (existing.rowCount) throw new Error("Recipient already belongs to organization");
    await client.query(
      `INSERT INTO public.membership_invitations
       (id, organization_id, recipient_email, role_key, token_hash, invited_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [invitationId, parsed.organizationId, parsed.recipientEmail, parsed.roleKey, tokenHash, parsed.actorUserId, parsed.expiresAt],
    );
    await appendIdentityAudit(client, {
      organizationId: parsed.organizationId, actorUserId: parsed.actorUserId, actorMembershipId: actor.membershipId,
      action: "invitation.created", targetType: "invitation", targetId: invitationId,
      afterState: { recipientEmail: parsed.recipientEmail, roleKey: parsed.roleKey, expiresAt: parsed.expiresAt.toISOString() },
    });
    await client.query("COMMIT");
    return { invitationId, token };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function acceptInvitation(databaseUrl: string, token: string, userId: UserId): Promise<MembershipId> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  UserIdSchema.parse(userId);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid invitation token");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const invitation = await client.query<{
      id: string; organization_id: string; recipient_email: string; role_key: string; status: string; expires_at: Date;
    }>("SELECT * FROM public.membership_invitations WHERE token_hash = $1 FOR UPDATE", [tokenHash]);
    const row = invitation.rows[0];
    if (!row || row.status !== "pending" || row.expires_at.getTime() <= Date.now()) throw new Error("Invitation unavailable");
    const user = await client.query(
      `SELECT 1 FROM public.users WHERE id = $1 AND lower(primary_email) = $2 AND status = 'active'`,
      [userId, row.recipient_email],
    );
    if (user.rowCount !== 1) throw new Error("Invitation recipient mismatch");
    const organization = await client.query("SELECT 1 FROM public.organizations WHERE id = $1 AND status = 'active'", [row.organization_id]);
    if (organization.rowCount !== 1) throw new Error("Organization unavailable");
    const proposedId = createCanonicalId("membership");
    const membership = await client.query<{ id: string }>(
      `INSERT INTO public.memberships (id, organization_id, user_id, status, role_key, sponsor_type, joined_at)
       VALUES ($1, $2, $3, 'active', $4, 'organization', now())
       ON CONFLICT (organization_id, user_id) DO UPDATE
         SET status = 'active', role_key = EXCLUDED.role_key, joined_at = now(),
             suspended_at = NULL, updated_at = now()
         WHERE memberships.status = 'removed'
       RETURNING id`,
      [proposedId, row.organization_id, userId, row.role_key],
    );
    if (membership.rowCount !== 1) throw new Error("Membership already active or suspended");
    await client.query(
      `UPDATE public.membership_invitations
       SET status = 'accepted', accepted_by_user_id = $1, accepted_at = now() WHERE id = $2`,
      [userId, row.id],
    );
    await appendIdentityAudit(client, {
      organizationId: OrganizationIdSchema.parse(row.organization_id), actorUserId: userId,
      actorMembershipId: MembershipIdSchema.parse(membership.rows[0]!.id),
      action: "invitation.accepted", targetType: "invitation", targetId: row.id,
      beforeState: { status: "pending" }, afterState: { status: "accepted", userId },
    });
    await appendIdentityAudit(client, {
      organizationId: OrganizationIdSchema.parse(row.organization_id), actorUserId: userId,
      actorMembershipId: MembershipIdSchema.parse(membership.rows[0]!.id),
      action: "membership.activated", targetType: "membership", targetId: membership.rows[0]!.id,
      afterState: { userId, roleKey: row.role_key, status: "active", sponsorType: "organization" },
    });
    await client.query("COMMIT");
    return MembershipIdSchema.parse(membership.rows[0]!.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function changeMembershipStatus(databaseUrl: string, input: {
  actorUserId: string; organizationId: string; membershipId: string; action: "suspend" | "reactivate" | "remove";
}): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const actorUserId = UserIdSchema.parse(input.actorUserId);
  const organizationId = OrganizationIdSchema.parse(input.organizationId);
  const membershipId = MembershipIdSchema.parse(input.membershipId);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const actor = await requireMembershipAdmin(client, actorUserId, organizationId);
    const target = await client.query<{ role_key: RoleKey; status: string }>(
      "SELECT role_key, status FROM public.memberships WHERE id = $1 AND organization_id = $2 FOR UPDATE",
      [membershipId, organizationId],
    );
    const member = target.rows[0];
    if (!member || member.role_key === "owner" || (member.role_key === "admin" && actor.roleKey !== "owner")) {
      throw new Error("Membership change denied");
    }
    const expected = input.action === "reactivate" ? "suspended" : input.action === "suspend" ? "active" : ["active", "suspended"];
    if (Array.isArray(expected) ? !expected.includes(member.status) : member.status !== expected) {
      throw new Error("Invalid membership transition");
    }
    const next = input.action === "reactivate" ? "active" : input.action === "suspend" ? "suspended" : "removed";
    await client.query(
      `UPDATE public.memberships SET status = $1,
       suspended_at = CASE WHEN $1 = 'suspended' THEN now() ELSE NULL END,
       updated_at = now() WHERE id = $2 AND organization_id = $3`,
      [next, membershipId, organizationId],
    );
    if (next === "removed") {
      await client.query(
        "UPDATE public.team_memberships SET ended_at = now() WHERE membership_id = $1 AND organization_id = $2 AND ended_at IS NULL",
        [membershipId, organizationId],
      );
      const revoked = await client.query<{ id: string }>(
        `UPDATE public.membership_invitations AS i SET status = 'revoked', revoked_at = now()
         FROM public.memberships AS m JOIN public.users AS u ON u.id = m.user_id
         WHERE m.id = $1 AND m.organization_id = $2
           AND i.organization_id = m.organization_id
           AND i.recipient_email = lower(u.primary_email) AND i.status = 'pending'
         RETURNING i.id`,
        [membershipId, organizationId],
      );
      for (const invitation of revoked.rows) {
        await appendIdentityAudit(client, {
          organizationId, actorUserId, actorMembershipId: actor.membershipId,
          action: "invitation.revoked", targetType: "invitation", targetId: invitation.id,
          beforeState: { status: "pending" }, afterState: { status: "revoked" },
        });
      }
    }
    await appendIdentityAudit(client, {
      organizationId, actorUserId, actorMembershipId: actor.membershipId,
      action: input.action === "reactivate" ? "membership.reactivated" : `membership.${next}`,
      targetType: "membership", targetId: membershipId,
      beforeState: { status: member.status, roleKey: member.role_key },
      afterState: { status: next, roleKey: member.role_key },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
