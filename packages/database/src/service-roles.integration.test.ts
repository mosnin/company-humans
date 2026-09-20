import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { syncClerkUser } from "./clerk-users.js";
import { createOrganization } from "./organizations.js";
import { inviteMember, acceptInvitation, changeMembershipStatus } from "./membership-lifecycle.js";
import { renameOrganization } from "./organization-authority.js";
import { createTeam, assignTeamMember } from "./teams.js";
import { listAuditEvents, listPeople, listRolePolicies, listTeams } from "./administration.js";
import { setRolePermissions } from "./role-permissions.js";
import { enableProductInstance } from "./product-instances.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("restricted runtime write roles", () => {
  it("handles the identity and organization lifecycle without migration-owner credentials", async () => {
    const suffix = randomBytes(6).toString("hex");
    const identityRole = `ch_identity_${suffix}`;
    const serviceRole = `ch_service_${suffix}`;
    const password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE ROLE ${identityRole} LOGIN PASSWORD '${password}'`);
    await admin.query(`CREATE ROLE ${serviceRole} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_identity TO ${identityRole}`);
    await admin.query(`GRANT company_human_service TO ${serviceRole}`);
    const identityUrl = new URL(databaseUrl!);
    identityUrl.username = identityRole;
    identityUrl.password = password;
    const serviceUrl = new URL(databaseUrl!);
    serviceUrl.username = serviceRole;
    serviceUrl.password = password;
    let organizationId: string | undefined;
    let otherOrganizationId: string | undefined;
    let teamId: string | undefined;
    let instanceId: string | undefined;
    const userIds: string[] = [];
    try {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        await expect(syncClerkUser(databaseUrl!, {
          clerkUserId: `user_ForbiddenIdentity${suffix}`, primaryEmail: null,
          displayName: "Forbidden", status: "active", eventTimestamp: 1,
        })).rejects.toThrow("restricted identity role");
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
      const owner = await syncClerkUser(identityUrl.toString(), {
        clerkUserId: `user_ServiceOwner${suffix}`, primaryEmail: `owner-${suffix}@example.test`,
        displayName: "Owner", status: "active", eventTimestamp: 1,
      });
      userIds.push(owner);
      const invitee = await syncClerkUser(identityUrl.toString(), {
        clerkUserId: `user_ServiceInvitee${suffix}`, primaryEmail: `invitee-${suffix}@example.test`,
        displayName: "Invitee", status: "active", eventTimestamp: 1,
      });
      userIds.push(invitee);
      const otherOwner = await syncClerkUser(identityUrl.toString(), {
        clerkUserId: `user_ServiceOther${suffix}`, primaryEmail: `other-${suffix}@example.test`,
        displayName: "Other", status: "active", eventTimestamp: 1,
      });
      userIds.push(otherOwner);

      process.env.NODE_ENV = "production";
      try {
        await expect(createOrganization(databaseUrl!, {
          ownerUserId: owner, slug: `forbidden-${suffix}`, name: "Forbidden",
        })).rejects.toThrow("restricted service role");
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }

      organizationId = (await createOrganization(serviceUrl.toString(), {
        ownerUserId: owner, slug: `service-${suffix}`, name: "Service Org",
      })).organizationId;
      otherOrganizationId = (await createOrganization(serviceUrl.toString(), {
        ownerUserId: otherOwner, slug: `service-other-${suffix}`, name: "Other Org",
      })).organizationId;
      await renameOrganization(serviceUrl.toString(), { actorUserId: owner, organizationId, name: "Renamed Service Org" });
      const invitation = await inviteMember(serviceUrl.toString(), {
        actorUserId: owner, organizationId, recipientEmail: `invitee-${suffix}@example.test`,
        roleKey: "contributor", expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(acceptInvitation(serviceUrl.toString(), invitation.token, invitee, "different@example.test")).rejects.toThrow("Invitation unavailable");
      const membershipId = await acceptInvitation(serviceUrl.toString(), invitation.token, invitee, `invitee-${suffix}@example.test`);
      teamId = await createTeam(serviceUrl.toString(), { actorUserId: owner, organizationId, name: "Sales" });
      await assignTeamMember(serviceUrl.toString(), {
        actorUserId: owner, organizationId, teamId, membershipId, teamRole: "member",
      });
      const scalar = await admin.query<{ id: string }>("SELECT id FROM products WHERE product_key = 'scalar'");
      instanceId = await enableProductInstance(serviceUrl.toString(), {
        actorUserId: owner, organizationId, productId: scalar.rows[0]!.id, mode: "connected",
      });
      await expect(renameOrganization(serviceUrl.toString(), {
        actorUserId: owner, organizationId: otherOrganizationId, name: "Forbidden",
      })).rejects.toThrow();

      expect((await listPeople(serviceUrl.toString(), owner, organizationId)).total).toBe(2);
      expect((await listPeople(serviceUrl.toString(), owner, organizationId, "Invitee")).people.map(person => person.id)).toEqual([membershipId]);
      expect((await listTeams(serviceUrl.toString(), owner, organizationId))[0]?.members).toEqual([{ name: "Invitee", role: "member" }]);
      expect(await listRolePolicies(serviceUrl.toString(), owner, organizationId)).toHaveLength(6);
      await expect(listPeople(serviceUrl.toString(), invitee, organizationId)).rejects.toThrow("administration denied");
      await expect(listRolePolicies(serviceUrl.toString(), invitee, organizationId)).rejects.toThrow("administration denied");
      await expect(listTeams(serviceUrl.toString(), owner, otherOrganizationId)).rejects.toThrow("administration denied");

      const contributorRole = (await admin.query<{ id: string }>("SELECT id FROM roles WHERE organization_id = $1 AND key = 'contributor'", [organizationId])).rows[0]!.id;
      const originalGrants = (await admin.query<{ permission_key: string }>("SELECT permission_key FROM role_permissions WHERE role_id = $1", [contributorRole])).rows.map(row => row.permission_key);
      const policy = { actorUserId: owner, organizationId, roleId: contributorRole, expectedCapabilities: originalGrants, capabilities: originalGrants.filter(key => key !== "crm.read.own") };
      await setRolePermissions(serviceUrl.toString(), policy);
      expect((await admin.query("SELECT permission_key FROM role_permissions WHERE role_id = $1 AND permission_key = 'crm.read.own'", [contributorRole])).rowCount).toBe(0);
      await expect(setRolePermissions(serviceUrl.toString(), policy)).rejects.toThrow("reload before saving");
      await expect(setRolePermissions(serviceUrl.toString(), { ...policy, actorUserId: invitee })).rejects.toThrow("change denied");
      await expect(setRolePermissions(serviceUrl.toString(), { ...policy, organizationId: otherOrganizationId })).rejects.toThrow("change denied");
      const audit = await admin.query("SELECT before_state,after_state FROM identity_audit_events WHERE target_id = $1 AND action = 'role.permissions.changed'", [contributorRole]);
      expect(audit.rows).toHaveLength(1);
      const history = await listAuditEvents(serviceUrl.toString(), owner, organizationId);
      expect(history.events.find(event => event.action === "role.permissions.changed")?.actorName).toBe("Owner");
      await expect(listAuditEvents(serviceUrl.toString(), invitee, organizationId)).rejects.toThrow("administration denied");
      await expect(listAuditEvents(serviceUrl.toString(), owner, otherOrganizationId)).rejects.toThrow("administration denied");
      expect(audit.rows[0].before_state.capabilities).toContain("crm.read.own");
      expect(audit.rows[0].after_state.capabilities).not.toContain("crm.read.own");
      await setRolePermissions(serviceUrl.toString(), { ...policy, expectedCapabilities: policy.capabilities, capabilities: originalGrants });

      // Capability revocation must affect server authorization, not only UI context.
      for (const [capability, action] of [
        ["organization.manage", () => renameOrganization(serviceUrl.toString(), { actorUserId: owner, organizationId: organizationId!, name: "Denied" })],
        ["members.manage", () => inviteMember(serviceUrl.toString(), { actorUserId: owner, organizationId: organizationId!, recipientEmail: "denied@example.test", roleKey: "contributor", expiresAt: new Date(Date.now() + 60_000) })],
        ["teams.create", () => createTeam(serviceUrl.toString(), { actorUserId: owner, organizationId: organizationId!, name: "Denied" })],
        ["applications.manage", () => enableProductInstance(serviceUrl.toString(), { actorUserId: owner, organizationId: organizationId!, productId: scalar.rows[0]!.id, mode: "connected" })],
      ] as const) {
        const grant = await admin.query<{ role_id: string }>("DELETE FROM role_permissions WHERE organization_id = $1 AND permission_key = $2 AND role_id IN (SELECT id FROM roles WHERE key = 'owner') RETURNING role_id", [organizationId, capability]);
        try { await expect(action()).rejects.toThrow("administration denied"); }
        finally { await admin.query("INSERT INTO role_permissions (organization_id, role_id, permission_key) VALUES ($1,$2,$3)", [organizationId, grant.rows[0]!.role_id, capability]); }
      }
      await expect(acceptInvitation(serviceUrl.toString(), invitation.token, otherOwner, `other-${suffix}@example.test`)).rejects.toThrow("Invitation unavailable");
      await changeMembershipStatus(serviceUrl.toString(), { actorUserId: owner, organizationId, membershipId, action: "suspend" });
      await changeMembershipStatus(serviceUrl.toString(), { actorUserId: owner, organizationId, membershipId, action: "reactivate" });

      const service = new Client({ connectionString: serviceUrl.toString() });
      await service.connect();
      try {
        await service.query("BEGIN");
        await service.query("SELECT set_config('company_human.user_id', $1, true), set_config('company_human.organization_id', $2, true)",
          [owner, organizationId]);
        expect((await service.query("SELECT id FROM organizations WHERE id = $1", [otherOrganizationId])).rowCount).toBe(0);
        expect((await service.query("UPDATE organizations SET name = 'Forbidden' WHERE id = $1 RETURNING id", [otherOrganizationId])).rowCount).toBe(0);
        await expect(service.query("UPDATE identity_audit_events SET action = 'tampered' WHERE organization_id = $1", [organizationId]))
          .rejects.toThrow();
        await service.query("ROLLBACK");
        // Bypass the TypeScript services: database policies must independently deny escalation.
        for (const [sql, params] of [
          ["UPDATE organizations SET name = 'Hijacked' WHERE id = $1 RETURNING id", [organizationId]],
          ["UPDATE memberships SET role_key = 'admin' WHERE id = $1 RETURNING id", [membershipId]],
          ["UPDATE product_instances SET provisioning_status = 'active' WHERE id = $1 RETURNING id", [instanceId]],
          ["UPDATE team_memberships SET team_role = 'manager' WHERE membership_id = $1 RETURNING membership_id", [membershipId]],
        ] as const) {
          await service.query("BEGIN");
          await service.query("SELECT set_config('company_human.user_id', $1, true), set_config('company_human.organization_id', $2, true)", [invitee, organizationId]);
          expect((await service.query(sql, [...params])).rowCount).toBe(0);
          await service.query("ROLLBACK");
        }
        await service.query("BEGIN");
        await service.query("SELECT set_config('company_human.user_id', $1, true), set_config('company_human.organization_id', $2, true)", [invitee, organizationId]);
        await expect(service.query("INSERT INTO role_permissions (organization_id,role_id,permission_key) SELECT organization_id,role_id,'members.manage' FROM memberships WHERE id = $1", [membershipId])).rejects.toThrow();
        await service.query("ROLLBACK");
        await service.query("BEGIN");
        await service.query("SELECT set_config('company_human.user_id', $1, true), set_config('company_human.organization_id', $2, true)", [owner, organizationId]);
        await expect(service.query("UPDATE organizations SET owner_user_id = $1 WHERE id = $2", [invitee, organizationId])).rejects.toThrow("Immutable identity");
        await service.query("ROLLBACK");
        await changeMembershipStatus(serviceUrl.toString(), { actorUserId: owner, organizationId, membershipId, action: "remove" });
        const reinvitation = await inviteMember(serviceUrl.toString(), {
          actorUserId: owner, organizationId, recipientEmail: `invitee-${suffix}@example.test`,
          roleKey: "contributor", expiresAt: new Date(Date.now() + 60_000),
        });
        expect(await acceptInvitation(serviceUrl.toString(), reinvitation.token, invitee, `invitee-${suffix}@example.test`)).toBe(membershipId);
        expect((await admin.query("SELECT ended_at FROM team_memberships WHERE membership_id = $1", [membershipId])).rows[0].ended_at).not.toBeNull();
      } finally {
        await service.end();
      }
    } finally {
      const orgs = [organizationId, otherOrganizationId].filter(Boolean);
      await admin.query("DELETE FROM product_instances WHERE id = $1", [instanceId ?? null]);
      await admin.query("DELETE FROM identity_audit_events WHERE organization_id = ANY($1)", [orgs]);
      await admin.query("DELETE FROM team_memberships WHERE team_id = $1", [teamId ?? null]);
      await admin.query("DELETE FROM teams WHERE id = $1", [teamId ?? null]);
      await admin.query("DELETE FROM membership_invitations WHERE organization_id = ANY($1)", [orgs]);
      await admin.query("DELETE FROM memberships WHERE organization_id = ANY($1)", [orgs]);
      await admin.query("DELETE FROM roles WHERE organization_id = ANY($1)", [orgs]);
      await admin.query("DELETE FROM organizations WHERE id = ANY($1)", [orgs]);
      await admin.query("DELETE FROM users WHERE id = ANY($1)", [userIds]);
      await admin.query(`DROP ROLE ${serviceRole}`);
      await admin.query(`DROP ROLE ${identityRole}`);
      await admin.end();
    }
  });
});
