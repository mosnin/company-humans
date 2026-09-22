import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe,expect,it } from "vitest";
import { createCanonicalId,type UserId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { inviteMember,acceptInvitation,changeMembershipStatus } from "./membership-lifecycle.js";
import { requestProductMembership } from "./product-memberships.js";
import { referenceProductId } from "./seed.js";
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("product membership offboarding",()=>{
  it("denies product intent atomically, preserves provider state, and does not restore old access on reinvitation",async()=>{
    const suffix=randomBytes(6).toString("hex"),role=`ch_offboard_${suffix}`,password=randomBytes(20).toString("hex");
    const admin=new Client({connectionString:databaseUrl});await admin.connect();
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_service TO ${role}`);
    const url=new URL(databaseUrl!);url.username=role;url.password=password;
    const users:UserId[]=[];let organizationId:string|undefined;
    try {
      for(const name of ["owner","admin","member"]) users.push(await syncAuthUser(databaseUrl!,{authIssuer:"https://identity.example.test",authSubject:`offboard-${name}-${suffix}`,primaryEmail:`${name}-${suffix}@example.test`,displayName:name,status:"active",eventTimestamp:1}));
      const [owner,manager,member]=users;
      const org=await createOrganization(databaseUrl!,{ownerUserId:owner!,name:"Offboarding",slug:`offboard-${suffix}`});organizationId=org.organizationId;
      async function join(userId:UserId,name:string,roleKey:"admin"|"contributor") {
        const invitation=await inviteMember(url.toString(),{actorUserId:owner!,organizationId:org.organizationId,recipientEmail:`${name}-${suffix}@example.test`,roleKey,expiresAt:new Date(Date.now()+86400000)});
        return acceptInvitation(url.toString(),invitation.token,userId,`${name}-${suffix}@example.test`);
      }
      await join(manager!,"admin","admin"); const membershipId=await join(member!,"member","contributor");
      // Explicit fixture policy: member administrator cannot configure applications.
      await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND permission_key='applications.manage' AND role_id IN (SELECT id FROM roles WHERE organization_id=$1 AND key='admin')",[organizationId]);
      const instance=createCanonicalId("productInstance");
      await admin.query(`INSERT INTO product_instances (id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id)
        VALUES ($1,$2,$3,'primary','connected','active',$4,$5)`,[instance,organizationId,referenceProductId("scalar"),`fixture-${suffix}`,owner]);
      const mapping=await requestProductMembership(url.toString(),{actorUserId:owner!,organizationId,productInstanceId:instance,membershipId});
      const change=(action:"suspend"|"reactivate"|"remove")=>changeMembershipStatus(url.toString(),{actorUserId:manager!,organizationId:organizationId!,membershipId,action});
      await expect(changeMembershipStatus(url.toString(),{actorUserId:member!,organizationId,membershipId,action:"suspend"})).rejects.toThrow();
      // Force command persistence failure; workspace and mapping changes must roll back together.
      const collision=createCanonicalId("provisioningOperation");
      await admin.query(`INSERT INTO product_membership_commands (id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id)
        VALUES ($1,$2,$3,2,'suspendMember',$4,$5)`,[collision,organizationId,mapping,`fixture-collision-${suffix}`,manager]);
      await expect(change("suspend")).rejects.toThrow();
      expect((await admin.query("SELECT status FROM memberships WHERE id=$1",[membershipId])).rows[0].status).toBe("active");
      expect((await admin.query("SELECT desired_enabled,desired_revision FROM product_memberships WHERE id=$1",[mapping])).rows[0]).toEqual({desired_enabled:true,desired_revision:1});
      await admin.query("DELETE FROM member_denial_jobs WHERE command_id=$1",[collision]);
      await admin.query("DELETE FROM product_membership_commands WHERE id=$1",[collision]);
      await change("suspend");
      const row=async()=>(await admin.query("SELECT desired_enabled,desired_revision,provisioning_status FROM product_memberships WHERE id=$1",[mapping])).rows[0];
      expect(await row()).toEqual({desired_enabled:false,desired_revision:2,provisioning_status:"pending"});
      await change("reactivate"); expect((await row()).desired_enabled).toBe(false);
      await change("remove");
      expect(await join(member!,"member","contributor")).toBe(membershipId);
      expect(await row()).toEqual({desired_enabled:false,desired_revision:3,provisioning_status:"pending"});
      const commands=(await admin.query("SELECT operation,desired_revision,idempotency_key FROM product_membership_commands WHERE product_membership_id=$1 ORDER BY desired_revision",[mapping])).rows;
      expect(commands.map(r=>r.operation)).toEqual(["provisionMember","suspendMember","removeMember"]);
      expect(new Set(commands.map(r=>r.idempotency_key)).size).toBe(3);
      const denied=(await admin.query("SELECT count(*)::int AS n FROM identity_audit_events WHERE target_id=$1 AND action='product.membership.access_denied'",[mapping])).rows[0].n;
      expect(denied).toBe(2);
      const runtime=new Client({connectionString:url.toString()});await runtime.connect();
      try {await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[owner,organizationId]);
        await expect(runtime.query("DELETE FROM product_membership_commands WHERE product_membership_id=$1",[mapping])).rejects.toThrow();
        await expect(runtime.query("UPDATE product_membership_commands SET operation='provisionMember' WHERE product_membership_id=$1",[mapping])).rejects.toThrow();
      } finally {await runtime.end();}
      // Race a second product mapping with suspension: no enabled mapping may survive.
      const second=createCanonicalId("productInstance");
      await admin.query(`INSERT INTO product_instances (id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id)
        VALUES ($1,$2,$3,'secondary','connected','active',$4,$5)`,[second,organizationId,referenceProductId("scalar"),`fixture-second-${suffix}`,owner]);
      const results=await Promise.allSettled([requestProductMembership(url.toString(),{actorUserId:owner!,organizationId,productInstanceId:second,membershipId}),change("suspend")]);
      if (results[1]!.status === "rejected") throw results[1]!.reason;
      expect(results[1]!.status).toBe("fulfilled");
      expect((await admin.query("SELECT count(*)::int AS n FROM product_memberships WHERE organization_id=$1 AND membership_id=$2 AND desired_enabled",[organizationId,membershipId])).rows[0].n).toBe(0);
      // Deterministic database-level race: observe the INSERT waiting for the
      // parent's uncommitted transition, then ensure it rejects the new status.
      const third=createCanonicalId("productInstance");
      await admin.query(`INSERT INTO product_instances (id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id)
        VALUES ($1,$2,$3,'third','connected','active',$4,$5)`,[third,organizationId,referenceProductId("scalar"),`fixture-third-${suffix}`,owner]);
      await admin.query("UPDATE memberships SET status='active' WHERE id=$1",[membershipId]);
      const concurrent=new Client({connectionString:url.toString()});await concurrent.connect();
      let insertion:Promise<unknown>|undefined;
      try {
        await concurrent.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[owner,organizationId]);
        const pid=(await concurrent.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await admin.query("BEGIN");
        await admin.query("UPDATE memberships SET status='suspended' WHERE id=$1",[membershipId]);
        insertion=concurrent.query(`INSERT INTO product_memberships (id,organization_id,product_instance_id,membership_id,created_by_user_id)
          VALUES ($1,$2,$3,$4,$5)`,[createCanonicalId("productMembership"),organizationId,third,membershipId,owner]).then(()=>"unexpected success",error=>error.code);
        let waiting=false;
        for(let attempt=0;attempt<30 && !waiting;attempt++) {
          waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS waiting",[pid])).rows[0].waiting;
          if(!waiting) await new Promise(resolve=>setTimeout(resolve,50));
        }
        expect(waiting).toBe(true);
        await admin.query("COMMIT");
        expect(await insertion).toBe("42501");
      } finally {await admin.query("ROLLBACK");await insertion;await concurrent.end();}

    } finally {
      if(organizationId) {for(const table of ["member_denial_attempts","member_denial_jobs","product_membership_commands","product_memberships","identity_audit_events","membership_invitations","product_instances","memberships","roles"]) await admin.query(`DELETE FROM ${table} WHERE organization_id=$1`,[organizationId]);await admin.query("DELETE FROM organizations WHERE id=$1",[organizationId]);}
      await admin.query("DELETE FROM users WHERE id=ANY($1)",[users]);await admin.query(`DROP ROLE ${role}`);await admin.end();
    }
  });
});
