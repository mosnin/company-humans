import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { inviteMember, acceptInvitation, revokeInvitation } from "./membership-lifecycle.js";
import { listInvitations } from "./administration.js";
const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("invitation revocation", () => {
  it("enforces tenant and capability boundaries, serializes acceptance, and audits revocation once", async () => {
    const suffix = randomBytes(6).toString("hex"); const role = `ch_invites_${suffix}`; const password = randomBytes(20).toString("hex");
    const admin = new Client({ connectionString: databaseUrl }); await admin.connect();
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_service TO ${role}`);
    const serviceUrl = new URL(databaseUrl!); serviceUrl.username=role; serviceUrl.password=password;
    const users: string[]=[]; const organizations: string[]=[];
    try {
      for (const name of ["owner","contributor","recipient"]) users.push(await syncAuthUser(databaseUrl!, { authIssuer:"https://identity.example.test",authSubject:`${name}-${suffix}`,primaryEmail:`${name}-${suffix}@example.test`,displayName:name,status:"active",eventTimestamp:1 }));
      const [owner,contributor,recipient]=users;
      const org=await createOrganization(databaseUrl!,{ownerUserId:owner!,name:"Invites",slug:`invites-${suffix}`}); organizations.push(org.organizationId);
      const other=await createOrganization(databaseUrl!,{ownerUserId:recipient!,name:"Other",slug:`other-invites-${suffix}`}); organizations.push(other.organizationId);
      const invite = (email: string) => inviteMember(serviceUrl.toString(),{actorUserId:owner!,organizationId:org.organizationId,recipientEmail:email,roleKey:"contributor",expiresAt:new Date(Date.now()+86400000)});
      const contributorInvite=await invite(`contributor-${suffix}@example.test`);
      await acceptInvitation(serviceUrl.toString(),contributorInvite.token,contributor! as Parameters<typeof acceptInvitation>[2],`contributor-${suffix}@example.test`);
      const pending=await invite(`recipient-${suffix}@example.test`);
      const input={actorUserId:owner!,organizationId:org.organizationId,invitationId:pending.invitationId};
      await expect(revokeInvitation(serviceUrl.toString(),{...input,actorUserId:contributor!})).rejects.toThrow();
      await expect(revokeInvitation(serviceUrl.toString(),{...input,actorUserId:recipient!,organizationId:other.organizationId})).rejects.toThrow();
      await expect(listInvitations(serviceUrl.toString(),contributor!,org.organizationId)).rejects.toThrow();
      expect((await listInvitations(serviceUrl.toString(),recipient!,other.organizationId)).invitations).toEqual([]);
      const listed=await listInvitations(serviceUrl.toString(),owner!,org.organizationId);
      expect(listed.total).toBe(2);
      expect(Object.keys(listed.invitations[0]!).sort()).toEqual(["email","expiresAt","id","roleKey","status"]);
      await Promise.all([revokeInvitation(serviceUrl.toString(),input),revokeInvitation(serviceUrl.toString(),input)]);
      await expect(acceptInvitation(serviceUrl.toString(),pending.token,recipient! as Parameters<typeof acceptInvitation>[2],`recipient-${suffix}@example.test`)).rejects.toThrow("Invitation unavailable");
      expect((await admin.query("SELECT count(*)::int AS n FROM identity_audit_events WHERE target_id=$1 AND action='invitation.revoked'",[pending.invitationId])).rows[0].n).toBe(1);
      await expect(revokeInvitation(serviceUrl.toString(),{...input,invitationId:contributorInvite.invitationId})).rejects.toThrow();
      const racing=await invite(`recipient-${suffix}@example.test`);
      const outcome=await Promise.allSettled([revokeInvitation(serviceUrl.toString(),{...input,invitationId:racing.invitationId}),acceptInvitation(serviceUrl.toString(),racing.token,recipient! as Parameters<typeof acceptInvitation>[2],`recipient-${suffix}@example.test`)]);
      expect(outcome.filter(result=>result.status==="fulfilled")).toHaveLength(1);
      const state=(await admin.query("SELECT status FROM membership_invitations WHERE id=$1",[racing.invitationId])).rows[0].status;
      const members=(await admin.query("SELECT count(*)::int AS n FROM memberships WHERE organization_id=$1 AND user_id=$2",[org.organizationId,recipient])).rows[0].n;
      expect(members).toBe(state==="accepted"?1:0);
    } finally {
      for (const table of ["identity_audit_events","membership_invitations","memberships","roles"]) await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[organizations]);
      await admin.query("DELETE FROM organizations WHERE id=ANY($1)",[organizations]);
      await admin.query("DELETE FROM users WHERE id=ANY($1)",[users]);
      await admin.query(`DROP ROLE ${role}`); await admin.end();
    }
  });
});
