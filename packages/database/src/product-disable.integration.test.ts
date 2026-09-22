import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createCanonicalId, type UserId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { disableProductInstance, enableProductInstance } from "./product-instances.js";
import { requestProductMembership } from "./product-memberships.js";
import { referenceProductId } from "./seed.js";
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("product disable boundary",()=>{
  it("atomically denies mappings, persists suspension, rejects foreign actors and fences concurrent insertion",async()=>{
    const suffix=randomBytes(6).toString("hex"),role=`ch_disable_${suffix}`,password=randomBytes(20).toString("hex");
    const admin=new Client({connectionString:databaseUrl});await admin.connect();
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_service TO ${role}`);
    const url=new URL(databaseUrl!);url.username=role;url.password=password;
    const users:UserId[]=[];const orgIds:string[]=[];
    try {
      for(const name of ["owner","foreign"]) users.push(await syncAuthUser(databaseUrl!,{authIssuer:"https://identity.example.test",authSubject:`disable-${name}-${suffix}`,primaryEmail:null,displayName:name,status:"active",eventTimestamp:1}));
      const org=await createOrganization(databaseUrl!,{ownerUserId:users[0]!,name:"Disable",slug:`disable-${suffix}`});orgIds.push(org.organizationId);
      const foreign=await createOrganization(databaseUrl!,{ownerUserId:users[1]!,name:"Foreign",slug:`foreign-${suffix}`});orgIds.push(foreign.organizationId);
      const membershipId=(await admin.query("SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2",[org.organizationId,users[0]])).rows[0].id;
      async function fixture(key:string) {
        const id=createCanonicalId("productInstance");
        await admin.query(`INSERT INTO product_instances (id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id)
          VALUES ($1,$2,$3,$4,'connected','active',$5,$6)`,[id,org.organizationId,referenceProductId("scalar"),key,`fixture-${key}-${suffix}`,users[0]]);
        return id;
      }
      const instance=await fixture("primary");
      const scope={actorUserId:users[0]!,organizationId:org.organizationId,productInstanceId:instance};
      const mapping=await requestProductMembership(url.toString(),{...scope,membershipId});
      await expect(disableProductInstance(url.toString(),{...scope,actorUserId:users[1]!})).rejects.toThrow("Application administration denied");
      await expect(disableProductInstance(url.toString(),{...scope,organizationId:foreign.organizationId,actorUserId:users[1]!})).rejects.toThrow("Product instance unavailable");
      const collision=createCanonicalId("provisioningOperation");
      await admin.query(`INSERT INTO product_membership_commands (id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id)
        VALUES ($1,$2,$3,2,'suspendMember',$4,$5)`,[collision,org.organizationId,mapping,`collision-${suffix}`,users[0]]);
      await expect(disableProductInstance(url.toString(),scope)).rejects.toThrow();
      expect((await admin.query("SELECT desired_enabled FROM product_instances WHERE id=$1",[instance])).rows[0].desired_enabled).toBe(true);
      expect((await admin.query("SELECT desired_enabled,desired_revision FROM product_memberships WHERE id=$1",[mapping])).rows[0]).toEqual({desired_enabled:true,desired_revision:1});
      await admin.query("DELETE FROM member_denial_jobs WHERE command_id=$1",[collision]);
      await admin.query("DELETE FROM product_membership_commands WHERE id=$1",[collision]);
      await Promise.all(Array.from({length:6},()=>disableProductInstance(url.toString(),scope)));
      expect((await admin.query("SELECT desired_enabled,provisioning_status FROM product_instances WHERE id=$1",[instance])).rows[0]).toEqual({desired_enabled:false,provisioning_status:"active"});
      expect((await admin.query("SELECT desired_enabled,desired_revision,provisioning_status FROM product_memberships WHERE id=$1",[mapping])).rows[0]).toEqual({desired_enabled:false,desired_revision:2,provisioning_status:"pending"});
      expect((await admin.query("SELECT operation,desired_revision FROM product_membership_commands WHERE product_membership_id=$1 ORDER BY desired_revision",[mapping])).rows).toEqual([{operation:"provisionMember",desired_revision:1},{operation:"suspendMember",desired_revision:2}]);
      expect((await admin.query("SELECT count(*)::int AS n FROM identity_audit_events WHERE target_id=$1 AND action='product.instance.disabled'",[instance])).rows[0].n).toBe(1);
      await expect(enableProductInstance(url.toString(),{actorUserId:users[0]!,organizationId:org.organizationId,productId:referenceProductId("scalar"),mode:"connected"})).rejects.toThrow("requires reconciliation");
      await expect(requestProductMembership(url.toString(),{...scope,membershipId})).rejects.toThrow("unavailable");
      // Race the public services: any inserted mapping must be denied at commit.
      const second=await fixture("second");
      const raced=await Promise.allSettled([requestProductMembership(url.toString(),{...scope,productInstanceId:second,membershipId}),disableProductInstance(url.toString(),{...scope,productInstanceId:second})]);
      if(raced[1]!.status==="rejected") throw raced[1]!.reason;
      expect((await admin.query("SELECT count(*)::int AS n FROM product_memberships WHERE product_instance_id=$1 AND desired_enabled",[second])).rows[0].n).toBe(0);
      // Hold an uncommitted disable; direct restricted INSERT must wait and deny.
      const third=await fixture("third");
      const runtime=new Client({connectionString:url.toString()});await runtime.connect();let insertion:Promise<unknown>|undefined;
      try {
        await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[users[0],org.organizationId]);
        await expect(runtime.query("UPDATE product_instances SET desired_enabled=true WHERE id=$1",[instance])).rejects.toThrow();
        await expect(runtime.query("UPDATE product_instances SET provisioning_status='suspended' WHERE id=$1",[instance])).rejects.toThrow("Immutable identity or provider fields");
        await runtime.query("SELECT set_config('company_human.user_id',$1,false)",[users[1]]);
        expect((await runtime.query("UPDATE product_instances SET desired_enabled=false WHERE id=$1",[third])).rowCount).toBe(0);
        await runtime.query("SELECT set_config('company_human.user_id',$1,false)",[users[0]]);
        const pid=(await runtime.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await admin.query("BEGIN");await admin.query("UPDATE product_instances SET desired_enabled=false WHERE id=$1",[third]);
        insertion=runtime.query(`INSERT INTO product_memberships (id,organization_id,product_instance_id,membership_id,created_by_user_id)
          VALUES ($1,$2,$3,$4,$5)`,[createCanonicalId("productMembership"),org.organizationId,third,membershipId,users[0]]).then(()=>"unexpected success",error=>error.code);
        let waiting=false;
        for(let n=0;n<40&&!waiting;n++) {
          waiting=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted) AS waiting",[pid])).rows[0].waiting;
          if(!waiting) await new Promise(resolve=>setTimeout(resolve,25));
        }
        expect(waiting).toBe(true);await admin.query("COMMIT");expect(await insertion).toBe("42501");
      } finally {await admin.query("ROLLBACK");await insertion;await runtime.end();}
    } finally {
      for(const table of ["member_denial_attempts","member_denial_jobs","product_membership_commands","product_memberships","identity_audit_events","product_instances","memberships","roles"]) await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgIds]);
      await admin.query("DELETE FROM organizations WHERE id=ANY($1)",[orgIds]);await admin.query("DELETE FROM users WHERE id=ANY($1)",[users]);await admin.query(`DROP ROLE ${role}`);await admin.end();
    }
  });
});
