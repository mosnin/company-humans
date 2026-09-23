import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createCanonicalId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import { setProductEntitlement } from "./product-entitlements.js";
import { readApplicationEntitlements } from "./administration.js";
const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("entitlement policy history", () => {
  it("serializes edits, preserves history and denies foreign tenants under restricted credentials", async () => {
    const suffix=randomBytes(6).toString('hex'), role=`ch_ent_${suffix}`, password=randomBytes(20).toString('hex');
    const admin=new Client({connectionString:databaseUrl}); await admin.connect();
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT company_human_service TO ${role}`);
    const url=new URL(databaseUrl!); url.username=role; url.password=password;
    const runtime=new Client({connectionString:url.toString()}); await runtime.connect();
    const alice=await syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`ent-a-${suffix}`,primaryEmail:null,displayName:'Alice',status:'active',eventTimestamp:1});
    const bob=await syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`ent-b-${suffix}`,primaryEmail:null,displayName:'Bob',status:'active',eventTimestamp:1});
    const org=await createOrganization(databaseUrl!,{ownerUserId:alice,slug:`ent-a-${suffix}`,name:'A'});
    const other=await createOrganization(databaseUrl!,{ownerUserId:bob,slug:`ent-b-${suffix}`,name:'B'});
    const orgs=[org.organizationId,other.organizationId], product=createCanonicalId('product'), instance=createCanonicalId('productInstance');
    const metadata={schemaVersion:1,description:'Test only',category:'sales',supportedCapabilities:['lead-enrichment'],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:['enriched-leads'],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
    try {
      await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`ent-${suffix}`,metadata]);
      await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'primary','connected',$4)",[instance,org.organizationId,product,alice]);
      const input={actorUserId:alice,organizationId:org.organizationId,productInstanceId:instance,membershipId:null,capability:'lead-enrichment',effect:'allow' as const,expectedRevision:0};
      const concurrent=await Promise.allSettled(Array.from({length:5},()=>setProductEntitlement(url.toString(),input)));
      expect(concurrent.filter(x=>x.status==='fulfilled')).toHaveLength(1);
      expect(concurrent.filter(x=>x.status==='rejected')).toHaveLength(4);
      const first=concurrent.find(x=>x.status==='fulfilled'); if(first?.status!=='fulfilled')throw new Error('No saved revision');
      const id=first.value.entitlementId;
      await setProductEntitlement(url.toString(),{...input,effect:'deny',expectedRevision:1});
      const override=await setProductEntitlement(url.toString(),{...input,membershipId:org.ownerMembershipId});
      expect(override.entitlementId).not.toBe(id);
      const view=await readApplicationEntitlements(url.toString(),alice,org.organizationId,instance,org.ownerMembershipId);
      expect(view.providerAccessConfirmed).toBe(false);
      expect(view.settings).toEqual([{capability:'lead-enrichment',effect:'allow',revision:1,organizationEffect:'deny',memberEffect:'allow',requestedEffect:'deny',allowAvailable:true}]);
      const defaultView=await readApplicationEntitlements(url.toString(),alice,org.organizationId,instance);
      expect(defaultView.settings[0]?.revision).toBe(2);
      expect(defaultView.settings[0]?.memberEffect).toBeNull();
      await expect(readApplicationEntitlements(url.toString(),bob,org.organizationId,instance)).rejects.toThrow();
      await expect(readApplicationEntitlements(url.toString(),alice,org.organizationId,instance,other.ownerMembershipId)).rejects.toThrow();
      await expect(readApplicationEntitlements(url.toString(),bob,other.organizationId,instance)).rejects.toThrow();

      await expect(setProductEntitlement(url.toString(),{...input,expectedRevision:1})).rejects.toThrow('Reload');
      await expect(setProductEntitlement(url.toString(),{...input,actorUserId:bob})).rejects.toThrow();
      await expect(setProductEntitlement(url.toString(),{...input,membershipId:other.ownerMembershipId})).rejects.toThrow('Membership unavailable');
      await expect(setProductEntitlement(url.toString(),{...input,organizationId:other.organizationId,actorUserId:bob})).rejects.toThrow('Product instance unavailable');
      await expect(setProductEntitlement(url.toString(),{...input,capability:'unknown'})).rejects.toThrow('Capability unavailable');
      await admin.query("UPDATE products SET catalog_metadata=NULL WHERE id=$1",[product]);
      await expect(setProductEntitlement(url.toString(),{...input,expectedRevision:2})).rejects.toThrow('Capability unavailable');
      await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,metadata]);
      const guard=`ent_audit_failure_${suffix}`;
      await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.target_id='${id}' AND NEW.action='product.entitlement.configured' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
      await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
      try {
        await expect(setProductEntitlement(url.toString(),{...input,effect:'inherit',expectedRevision:2})).rejects.toThrow('fixture audit failure');
        expect((await admin.query('SELECT max(revision) n FROM entitlement_policy_revisions WHERE entitlement_id=$1',[id])).rows[0].n).toBe(2);
      } finally {
        await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`);
        await admin.query(`DROP FUNCTION public.${guard}()`);
      }
      await admin.query("UPDATE products SET catalog_status='retired' WHERE id=$1",[product]);
      await expect(setProductEntitlement(url.toString(),{...input,expectedRevision:2})).rejects.toThrow('Capability unavailable');
      await setProductEntitlement(url.toString(),{...input,effect:'inherit',expectedRevision:2});
      const retired=await readApplicationEntitlements(url.toString(),alice,org.organizationId,instance);
      expect(retired.settings[0]?.allowAvailable).toBe(false);
      expect(retired.settings[0]?.revision).toBe(3);

      expect((await admin.query('SELECT revision,effect FROM entitlement_policy_revisions WHERE entitlement_id=$1 ORDER BY revision',[id])).rows).toEqual([{revision:1,effect:'allow'},{revision:2,effect:'deny'},{revision:3,effect:'inherit'}]);
      expect((await admin.query("SELECT count(*)::int n FROM identity_audit_events WHERE target_id=$1",[id])).rows[0].n).toBe(3);
      await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[bob,other.organizationId]);
      expect((await runtime.query('SELECT * FROM entitlement_policies WHERE id=$1',[id])).rowCount).toBe(0);
      expect((await runtime.query('SELECT * FROM entitlement_policy_revisions WHERE entitlement_id=$1',[id])).rowCount).toBe(0);
      await expect(runtime.query("INSERT INTO entitlement_policy_revisions VALUES($1,$2,4,'deny',$3,now())",[org.organizationId,id,bob])).rejects.toThrow();
      await runtime.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[alice,org.organizationId]);
      await expect(runtime.query("INSERT INTO entitlement_policy_revisions VALUES($1,$2,5,'deny',$3,now())",[org.organizationId,id,alice])).rejects.toThrow('must follow');
      await expect(runtime.query("UPDATE entitlement_policy_revisions SET effect='allow' WHERE entitlement_id=$1",[id])).rejects.toThrow();
      await expect(runtime.query('DELETE FROM entitlement_policy_revisions WHERE entitlement_id=$1',[id])).rejects.toThrow();
      await expect(admin.query("INSERT INTO entitlement_policies(id,organization_id,product_instance_id,membership_id,capability,created_by_user_id) VALUES($1,$2,$3,$4,'other',$5)",[createCanonicalId('entitlement'),org.organizationId,instance,other.ownerMembershipId,alice])).rejects.toThrow();
    } finally {
      await runtime.end();
      for(const table of ['entitlement_policy_revisions','entitlement_policies','identity_audit_events','product_instances','memberships','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
      await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);
      await admin.query('DELETE FROM users WHERE id=ANY($1)',[[alice,bob]]);
      await admin.query('DELETE FROM products WHERE id=$1',[product]);
      await admin.query(`DROP ROLE ${role}`); await admin.end();
    }
  });
});
