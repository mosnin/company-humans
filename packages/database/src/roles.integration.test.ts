import { randomBytes } from "node:crypto";
import { createCanonicalId, ROLE_KEYS, roleHasCapability, type MembershipId, type RoleKey, type TeamId } from "@company-human/contracts";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { syncClerkUser } from "./clerk-users.js";
import { createOrganization } from "./organizations.js";
import { changeMembershipRole, renameOrganization } from "./organization-authority.js";
import { resolveAccessContext } from "./rls.js";
import { assignTeamMember, createTeam } from "./teams.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("organization role and team resolution", () => {
  it("resolves six role policies and limits team assignment to the same tenant", async () => {
    const suffix = randomBytes(6).toString("hex");
    const roleName = `ch_role_test_${suffix}`;
    const password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_app TO ${roleName}`);
    const runtimeUrl = new URL(databaseUrl!);
    runtimeUrl.username = roleName;
    runtimeUrl.password = password;
    const users = [] as Array<Awaited<ReturnType<typeof syncClerkUser>>>;
    const owner = await syncClerkUser(databaseUrl!, { clerkUserId: `user_Owner${suffix}`, primaryEmail: null, displayName: "Owner", status: "active", eventTimestamp: 1 });
    users.push(owner);
    const org = await createOrganization(databaseUrl!, { ownerUserId: owner, slug: `roles-${suffix}`, name: "Roles Org" });
    const otherOwner = await syncClerkUser(databaseUrl!, { clerkUserId: `user_Other${suffix}`, primaryEmail: null, displayName: "Other", status: "active", eventTimestamp: 1 });
    users.push(otherOwner);
    const otherOrg = await createOrganization(databaseUrl!, { ownerUserId: otherOwner, slug: `other-roles-${suffix}`, name: "Other Org" });
    let teamId: TeamId | undefined;
    let otherTeamId: TeamId | undefined;
    try {
      const roleUsers = new Map<RoleKey, { userId: typeof owner; membershipId: MembershipId }>();
      roleUsers.set("owner", { userId: owner, membershipId: org.ownerMembershipId });
      for (const roleKey of ROLE_KEYS.filter((key) => key !== "owner")) {
        const userId = await syncClerkUser(databaseUrl!, {
          clerkUserId: `user_${roleKey}${suffix}`, primaryEmail: null, displayName: roleKey, status: "active", eventTimestamp: 1,
        });
        users.push(userId);
        const membershipId = createCanonicalId("membership");
        await admin.query(
          `INSERT INTO memberships (id, organization_id, user_id, status, role_key, sponsor_type, joined_at)
           VALUES ($1, $2, $3, 'active', $4, 'organization', now())`,
          [membershipId, org.organizationId, userId, roleKey],
        );
        roleUsers.set(roleKey, { userId, membershipId });
      }
      for (const roleKey of ROLE_KEYS) {
        const context = await resolveAccessContext(runtimeUrl.toString(), roleUsers.get(roleKey)!.userId, org.organizationId);
        expect(context?.roleKey).toBe(roleKey);
        expect(context?.capabilities).toContain(roleKey === "finance" ? "payouts.read.all" : "usage.read.own");
        expect(context?.capabilities.includes("payouts.read.all")).toBe(roleHasCapability(roleKey, "payouts.read.all"));
      }
      const contributorBeforeChange = roleUsers.get("contributor")!;
      await renameOrganization(databaseUrl!, { actorUserId: owner, organizationId: org.organizationId, name: "Renamed Roles Org" });
      await changeMembershipRole(databaseUrl!, {
        actorUserId: owner, organizationId: org.organizationId,
        membershipId: contributorBeforeChange.membershipId, roleKey: "finance",
      });
      expect((await resolveAccessContext(runtimeUrl.toString(), contributorBeforeChange.userId, org.organizationId))?.roleKey).toBe("finance");
      await expect(changeMembershipRole(databaseUrl!, {
        actorUserId: otherOwner, organizationId: org.organizationId,
        membershipId: contributorBeforeChange.membershipId, roleKey: "developer",
      })).rejects.toThrow("Organization administration denied");
      const auditActions = (await admin.query<{ action: string }>(
        "SELECT action FROM identity_audit_events WHERE organization_id = $1", [org.organizationId],
      )).rows.map((row) => row.action);
      expect(auditActions).toContain("organization.created");
      expect(auditActions).toContain("organization.renamed");
      expect(auditActions).toContain("membership.created");
      expect(auditActions).toContain("membership.role.changed");
      expect(auditActions.filter((action) => action === "role.created")).toHaveLength(6);
      const runtime = new Client({ connectionString: runtimeUrl.toString() });
      await runtime.connect();
      try {
        await runtime.query("BEGIN");
        await runtime.query("SELECT set_config('company_human.user_id', $1, true)", [owner]);
        expect((await runtime.query("SELECT id FROM identity_audit_events WHERE organization_id = $1", [org.organizationId])).rowCount)
          .toBeGreaterThan(0);
        await runtime.query("ROLLBACK");
        await runtime.query("BEGIN");
        await runtime.query("SELECT set_config('company_human.user_id', $1, true)", [roleUsers.get("finance")!.userId]);
        expect((await runtime.query("SELECT id FROM identity_audit_events WHERE organization_id = $1", [org.organizationId])).rowCount)
          .toBe(0);
        await runtime.query("ROLLBACK");
      } finally {
        await runtime.end();
      }
      expect(await resolveAccessContext(runtimeUrl.toString(), otherOwner, org.organizationId)).toBeNull();
      const manager = roleUsers.get("manager")!;
      teamId = await createTeam(databaseUrl!, { actorUserId: owner, organizationId: org.organizationId, name: "Sales" });
      await assignTeamMember(databaseUrl!, {
        actorUserId: owner, organizationId: org.organizationId, teamId,
        membershipId: manager.membershipId, teamRole: "manager",
      });
      const managerContext = await resolveAccessContext(runtimeUrl.toString(), manager.userId, org.organizationId);
      expect(managerContext?.teamIds).toEqual([teamId]);
      otherTeamId = await createTeam(databaseUrl!, { actorUserId: owner, organizationId: org.organizationId, name: "Creators" });
      const contributor = roleUsers.get("contributor")!;
      await assignTeamMember(databaseUrl!, {
        actorUserId: manager.userId, organizationId: org.organizationId, teamId,
        membershipId: contributor.membershipId, teamRole: "member",
      });
      expect((await resolveAccessContext(runtimeUrl.toString(), contributor.userId, org.organizationId))?.teamIds).toEqual([teamId]);
      await expect(assignTeamMember(databaseUrl!, {
        actorUserId: manager.userId, organizationId: org.organizationId, teamId: otherTeamId,
        membershipId: contributor.membershipId, teamRole: "member",
      })).rejects.toThrow("Team assignment denied");
      await expect(assignTeamMember(databaseUrl!, {
        actorUserId: manager.userId, organizationId: org.organizationId, teamId,
        membershipId: contributor.membershipId, teamRole: "manager",
      })).rejects.toThrow("Team assignment denied");
      await expect(createTeam(databaseUrl!, { actorUserId: otherOwner, organizationId: org.organizationId, name: "Forbidden" }))
        .rejects.toThrow("Team administration denied");
      await expect(assignTeamMember(databaseUrl!, {
        actorUserId: owner, organizationId: org.organizationId, teamId,
        membershipId: otherOrg.ownerMembershipId, teamRole: "member",
      })).rejects.toThrow("Active team member in organization required");
    } finally {
      await admin.query("DELETE FROM identity_audit_events WHERE organization_id = ANY($1)", [[org.organizationId, otherOrg.organizationId]]);
      if (teamId || otherTeamId) {
        await admin.query("DELETE FROM team_memberships WHERE team_id = ANY($1)", [[teamId, otherTeamId].filter(Boolean)]);
        await admin.query("DELETE FROM teams WHERE id = ANY($1)", [[teamId, otherTeamId].filter(Boolean)]);
      }
      await admin.query("DELETE FROM memberships WHERE organization_id = ANY($1)", [[org.organizationId, otherOrg.organizationId]]);
      await admin.query("DELETE FROM roles WHERE organization_id = ANY($1)", [[org.organizationId, otherOrg.organizationId]]);
      await admin.query("DELETE FROM organizations WHERE id = ANY($1)", [[org.organizationId, otherOrg.organizationId]]);
      await admin.query("DELETE FROM users WHERE id = ANY($1)", [users]);
      await admin.query(`DROP ROLE ${roleName}`);
      await admin.end();
    }
  });
});
