import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe,expect,it } from "vitest";
import { createCanonicalId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { enableProductInstance } from "./product-instances.js";
import { requestProductMembership } from "./product-memberships.js";
import { referenceProductId } from "./seed.js";
import { listApplicationMemberCandidates } from "./administration.js";
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("product membership mapping",()=>{
  it("binds one pending mapping to one tenant/member/instance without allowing manufactured provider success",async()=>{
    const suffix=randomBytes(6).toString("hex"), role=`ch_pmem_${suffix}`, password=randomBytes(20).toString("hex");
    const admin=new Client({connectionString:databaseUrl});await admin.connect();
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_service TO ${role}`);
    const url=new URL(databaseUrl!);url.username=role;url.password=password;
    const alice=await syncAuthUser(databaseUrl!,{authIssuer:"https://identity.example.test",authSubject:`pmem-alice-${suffix}`,primaryEmail:null,displayName:"Alice",status:"active",eventTimestamp:1});
    const bob=await syncAuthUser(databaseUrl!,{authIssuer:"https://identity.example.test",authSubject:`pmem-bob-${suffix}`,primaryEmail:null,displayName:"Bob",status:"active",eventTimestamp:1});
    const org=await createOrganization(databaseUrl!,{ownerUserId:alice,slug:`pmem-alice-${suffix}`,name:"Alice"});
    const other=await createOrganization(databaseUrl!,{ownerUserId:bob,slug:`pmem-bob-${suffix}`,name:"Bob"});
    const orgs=[org.organizationId,other.organizationId];
    const runtime=new Client({connectionString:url.toString()});await runtime.connect();
    try {
      const instance=await enableProductInstance(url.toString(),{actorUserId:alice,organizationId:org.organizationId,productId:referenceProductId("scalar"),mode:"connected"});
      const input={actorUserId:alice,organizationId:org.organizationId,productInstanceId:instance,membershipId:org.ownerMembershipId};
      await expect(requestProductMembership(url.toString(),input)).rejects.toThrow("Product or membership unavailable");
      // Explicit fixture activation, not a real Scalar organization or member.
      await admin.query("DELETE FROM product_instances WHERE id=$1",[instance]);
      await admin.query(`INSERT INTO product_instances (id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id)
        VALUES ($1,$2,$3,'primary','connected','active',$4,$5)`,[instance,org.organizationId,referenceProductId("scalar"),`fixture-${suffix}`,alice]);
      const candidates=await listApplicationMemberCandidates(url.toString(),alice,org.organizationId,instance);
      expect(candidates.members).toEqual([{id:org.ownerMembershipId,name:'Alice'}]);
      expect(candidates.total).toBe(1);
      expect((await listApplicationMemberCandidates(url.toString(),alice,org.organizationId,instance,'missing')).members).toEqual([]);
      expect((await listApplicationMemberCandidates(url.toString(),alice,org.organizationId,instance,'',2)).members).toEqual([]);
      await expect(listApplicationMemberCandidates(url.toString(),bob,org.organizationId,instance)).rejects.toThrow();
      await expect(listApplicationMemberCandidates(url.toString(),bob,other.organizationId,instance)).rejects.toThrow();
      const ids=await Promise.all(Array.from({length:6},()=>requestProductMembership(url.toString(),input)));
      expect(new Set(ids).size).toBe(1);
      expect((await listApplicationMemberCandidates(url.toString(),alice,org.organizationId,instance)).members).toEqual([]);
      expect((await admin.query("SELECT provisioning_status,external_member_id FROM product_memberships WHERE id=$1",[ids[0]])).rows[0]).toEqual({provisioning_status:"pending",external_member_id:null});
      expect((await admin.query("SELECT count(*)::int AS n FROM identity_audit_events WHERE target_id=$1 AND action='product.membership.requested'",[ids[0]])).rows[0].n).toBe(1);
      await expect(requestProductMembership(url.toString(),{...input,actorUserId:bob})).rejects.toThrow();
      await expect(requestProductMembership(url.toString(),{...input,membershipId:other.ownerMembershipId})).rejects.toThrow();
      await expect(admin.query(`INSERT INTO product_memberships (id,organization_id,product_instance_id,membership_id,created_by_user_id)
        VALUES ($1,$2,$3,$4,$5)`,[createCanonicalId("productMembership"),org.organizationId,instance,other.ownerMembershipId,alice])).rejects.toThrow();
      await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[bob,other.organizationId]);
      expect((await runtime.query("SELECT id FROM product_memberships WHERE id=$1",[ids[0]])).rowCount).toBe(0);
      await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[alice,org.organizationId]);
      await expect(runtime.query("UPDATE product_memberships SET external_member_id='forged',provisioning_status='active' WHERE id=$1",[ids[0]])).rejects.toThrow();
      await expect(runtime.query("DELETE FROM product_memberships WHERE id=$1",[ids[0]])).rejects.toThrow();
      await runtime.query("UPDATE product_memberships SET desired_enabled=false WHERE id=$1",[ids[0]]);
      await expect(runtime.query("UPDATE product_memberships SET desired_enabled=true WHERE id=$1",[ids[0]])).rejects.toThrow();
      await expect(requestProductMembership(url.toString(),input)).rejects.toThrow("reconciliation");
      await admin.query("UPDATE product_instances SET desired_enabled=false WHERE id=$1",[instance]);
      await expect(requestProductMembership(url.toString(),input)).rejects.toThrow("Product or membership unavailable");
      expect((await listApplicationMemberCandidates(url.toString(),alice,org.organizationId,instance)).available).toBe(false);
    } finally {
      await runtime.end();
      for(const table of ["product_membership_commands","product_memberships","identity_audit_events","product_instances","memberships","roles"]) await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
      await admin.query("DELETE FROM organizations WHERE id=ANY($1)",[orgs]);await admin.query("DELETE FROM users WHERE id=ANY($1)",[[alice,bob]]);
      await admin.query(`DROP ROLE ${role}`);await admin.end();
    }
  });
});
