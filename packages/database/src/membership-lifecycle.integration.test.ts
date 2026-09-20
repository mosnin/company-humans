import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { syncClerkUser } from "./clerk-users.js";
import { acceptInvitation, changeMembershipStatus, inviteMember } from "./membership-lifecycle.js";
import { createOrganization } from "./organizations.js";
import { resolveAccessContext } from "./rls.js";
import { assignTeamMember, createTeam } from "./teams.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("membership invitation and access lifecycle", () => {
  it("binds invite to email, denies suspended and removed access, and does not revive old team access", async () => {
    const suffix = randomBytes(6).toString("hex");
    const roleName = `ch_lifecycle_${suffix}`;
    const password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_app TO ${roleName}`);
    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.username = roleName;
    runtimeUrl.password = password;
    const owner = await syncClerkUser(databaseUrl!, {
      clerkUserId: `user_Owner${suffix}`, primaryEmail: `owner-${suffix}@example.test`, displayName: "Owner", status: "active", eventTimestamp: 1,
    });
    const recipient = await syncClerkUser(databaseUrl!, {
      clerkUserId: `user_Recipient${suffix}`, primaryEmail: `PERSON-${suffix}@EXAMPLE.TEST`, displayName: "Recipient", status: "active", eventTimestamp: 1,
    });
    const outsider = await syncClerkUser(databaseUrl!, {
      clerkUserId: `user_Outsider${suffix}`, primaryEmail: `outsider-${suffix}@example.test`, displayName: "Outsider", status: "active", eventTimestamp: 1,
    });
    const org = await createOrganization(databaseUrl!, { ownerUserId: owner, slug: `invite-${suffix}`, name: "Invite Org" });
    const teamId = await createTeam(databaseUrl!, { actorUserId: owner, organizationId: org.organizationId, name: "Sales" });
    try {
      const invitation = await inviteMember(databaseUrl!, {
        actorUserId: owner, organizationId: org.organizationId,
        recipientEmail: `PERSON-${suffix}@EXAMPLE.TEST`, roleKey: "contributor", expiresAt: new Date(Date.now() + 86_400_000),
      });
      expect(invitation.token).toHaveLength(43);
      expect((await admin.query("SELECT token_hash FROM membership_invitations WHERE id = $1", [invitation.invitationId])).rows[0]?.token_hash)
        .not.toBe(invitation.token);
      await expect(acceptInvitation(databaseUrl!, invitation.token, outsider)).rejects.toThrow("Invitation recipient mismatch");
      const membershipId = await acceptInvitation(databaseUrl!, invitation.token, recipient);
      await expect(acceptInvitation(databaseUrl!, invitation.token, recipient)).rejects.toThrow("Invitation unavailable");
      expect((await resolveAccessContext(runtimeUrl.toString(), recipient, org.organizationId))?.roleKey).toBe("contributor");
      await assignTeamMember(databaseUrl!, {
        actorUserId: owner, organizationId: org.organizationId, teamId, membershipId, teamRole: "member",
      });
      expect((await resolveAccessContext(runtimeUrl.toString(), recipient, org.organizationId))?.teamIds).toEqual([teamId]);
      await changeMembershipStatus(databaseUrl!, { actorUserId: owner, organizationId: org.organizationId, membershipId, action: "suspend" });
      expect(await resolveAccessContext(runtimeUrl.toString(), recipient, org.organizationId)).toBeNull();
      await changeMembershipStatus(databaseUrl!, { actorUserId: owner, organizationId: org.organizationId, membershipId, action: "reactivate" });
      expect((await resolveAccessContext(runtimeUrl.toString(), recipient, org.organizationId))?.teamIds).toEqual([teamId]);
      await changeMembershipStatus(databaseUrl!, { actorUserId: owner, organizationId: org.organizationId, membershipId, action: "remove" });
      expect(await resolveAccessContext(runtimeUrl.toString(), recipient, org.organizationId)).toBeNull();
      await expect(changeMembershipStatus(databaseUrl!, {
        actorUserId: owner, organizationId: org.organizationId, membershipId: org.ownerMembershipId, action: "suspend",
      })).rejects.toThrow("Membership change denied");
      const second = await inviteMember(databaseUrl!, {
        actorUserId: owner, organizationId: org.organizationId,
        recipientEmail: `person-${suffix}@example.test`, roleKey: "contributor", expiresAt: new Date(Date.now() + 86_400_000),
      });
      expect(await acceptInvitation(databaseUrl!, second.token, recipient)).toBe(membershipId);
      expect((await resolveAccessContext(runtimeUrl.toString(), recipient, org.organizationId))?.teamIds).toEqual([]);
    } finally {
      await admin.query("DELETE FROM team_memberships WHERE organization_id = $1", [org.organizationId]);
      await admin.query("DELETE FROM teams WHERE organization_id = $1", [org.organizationId]);
      await admin.query("DELETE FROM membership_invitations WHERE organization_id = $1", [org.organizationId]);
      await admin.query("DELETE FROM memberships WHERE organization_id = $1", [org.organizationId]);
      await admin.query("DELETE FROM roles WHERE organization_id = $1", [org.organizationId]);
      await admin.query("DELETE FROM organizations WHERE id = $1", [org.organizationId]);
      await admin.query("DELETE FROM users WHERE id = ANY($1)", [[owner, recipient, outsider]]);
      await admin.query(`DROP ROLE ${roleName}`);
      await admin.end();
    }
  });
});
