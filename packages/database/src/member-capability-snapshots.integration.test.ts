import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { describe,it,expect } from 'vitest';
import { createCanonicalId } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { setProductEntitlement } from './product-entitlements.js';
import { prepareMemberCapabilitySnapshot } from './member-capability-snapshots.js';
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)('durable member capability snapshots',()=>{
 it('serializes refresh, preserves provenance and isolates tenant history without granting access',async()=>{
  const suffix=randomBytes(6).toString('hex'),role=`ch_caps_${suffix}`,password=randomBytes(20).toString('hex');
  const admin=new Client({connectionString:databaseUrl});await admin.connect();await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_service TO ${role}`);
  const url=new URL(databaseUrl!);url.username=role;url.password=password;const sql=new Client({connectionString:url.toString()});await sql.connect();
  const users=await Promise.all(['one','two'].map(name=>syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`caps-${suffix}-${name}`,primaryEmail:null,displayName:name,status:'active',eventTimestamp:1})));
  const org=await createOrganization(databaseUrl!,{ownerUserId:users[0]!,slug:`caps-a-${suffix}`,name:'A'}),other=await createOrganization(databaseUrl!,{ownerUserId:users[1]!,slug:`caps-b-${suffix}`,name:'B'});
  const orgs=[org.organizationId,other.organizationId],product=createCanonicalId('product'),instance=createCanonicalId('productInstance'),mapping=createCanonicalId('productMembership');
  const input={actorUserId:users[0]!,organizationId:org.organizationId,productMembershipId:mapping};
  const metadata={schemaVersion:1,description:'Fixture only',category:'sales',supportedCapabilities:['read','write'],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:[],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
  try{
   await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`caps-${suffix}`,metadata]);
   await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active','fixture-org',$4)",[instance,org.organizationId,product,users[0]]);
   await admin.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,external_member_id,created_by_user_id) VALUES($1,$2,$3,$4,'suspended','fixture-member',$5)",[mapping,org.organizationId,instance,org.ownerMembershipId,users[0]]);
   const config={actorUserId:users[0]!,organizationId:org.organizationId,productInstanceId:instance,membershipId:null,capability:'read',effect:'allow' as const,expectedRevision:0};
   await setProductEntitlement(url.toString(),config);
   const snapshots=await Promise.all(Array.from({length:5},()=>prepareMemberCapabilitySnapshot(url.toString(),input)));
   expect(snapshots.every(s=>s.policyRevision===1&&s.capabilities.join(',')==='read')).toBe(true);
   expect((await admin.query('SELECT count(*)::int n FROM member_capability_snapshots WHERE product_membership_id=$1',[mapping])).rows[0].n).toBe(1);
   expect((await admin.query("SELECT count(*)::int n FROM identity_audit_events WHERE target_id=$1 AND action='product.capabilities.prepared'",[mapping])).rows[0].n).toBe(1);
   await setProductEntitlement(url.toString(),{...config,effect:'deny',expectedRevision:1});
   await setProductEntitlement(url.toString(),{...config,membershipId:org.ownerMembershipId});
   const denied=await prepareMemberCapabilitySnapshot(url.toString(),input);expect(denied.policyRevision).toBe(2);expect(denied.capabilities).toEqual([]);
   const stored=(await admin.query('SELECT source,payload FROM member_capability_snapshots WHERE product_membership_id=$1 AND policy_revision=2',[mapping])).rows[0];
   expect(stored.source.revisions).toHaveLength(2);expect(stored.source.desiredRevision).toBe(1);
   await setProductEntitlement(url.toString(),{...config,effect:'inherit',expectedRevision:2});
   expect((await prepareMemberCapabilitySnapshot(url.toString(),input)).capabilities).toEqual(['read']);
   await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,{...metadata,supportedCapabilities:['write']}]);
   expect((await prepareMemberCapabilitySnapshot(url.toString(),input)).capabilities).toEqual([]);
   expect((await admin.query('SELECT payload FROM member_capability_snapshots WHERE product_membership_id=$1 AND policy_revision=1',[mapping])).rows[0].payload.capabilities).toEqual(['read']);
   await expect(prepareMemberCapabilitySnapshot(url.toString(),{...input,actorUserId:users[1]!})).rejects.toThrow();
   await expect(prepareMemberCapabilitySnapshot(url.toString(),{...input,actorUserId:users[1]!,organizationId:other.organizationId})).rejects.toThrow('unavailable');
   await sql.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[users[1],other.organizationId]);
   expect((await sql.query('SELECT * FROM member_capability_snapshots WHERE product_membership_id=$1',[mapping])).rowCount).toBe(0);
   await sql.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[users[0],org.organizationId]);
   await expect(sql.query('UPDATE member_capability_snapshots SET payload=$2 WHERE product_membership_id=$1',[mapping,{}])).rejects.toThrow('permission denied');
   await expect(sql.query('DELETE FROM member_capability_snapshots WHERE product_membership_id=$1',[mapping])).rejects.toThrow('permission denied');
   await expect(sql.query('INSERT INTO member_capability_snapshots SELECT organization_id,product_membership_id,8,source,jsonb_set(payload,\'{policyRevision}\',\'8\'),actor_user_id,now() FROM member_capability_snapshots WHERE product_membership_id=$1 AND policy_revision=1',[mapping])).rejects.toThrow('must follow');
   const guard=`caps_audit_${suffix}`;
   await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${mapping}' AND NEW.action='product.capabilities.prepared' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
   await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
   await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,metadata]);
   try{await expect(prepareMemberCapabilitySnapshot(url.toString(),input)).rejects.toThrow('fixture audit failure');expect((await admin.query('SELECT max(policy_revision) n FROM member_capability_snapshots WHERE product_membership_id=$1',[mapping])).rows[0].n).toBe(4);}
   finally{await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await admin.query(`DROP FUNCTION public.${guard}()`);}
   await admin.query("UPDATE memberships SET status='suspended' WHERE organization_id=$1 AND id=$2",[org.organizationId,org.ownerMembershipId]);
   await expect(prepareMemberCapabilitySnapshot(url.toString(),input)).rejects.toThrow();
   expect((await admin.query('SELECT provisioning_status FROM product_memberships WHERE id=$1',[mapping])).rows[0].provisioning_status).toBe('suspended');
  }finally{
   await sql.end();for(const table of ['member_capability_snapshots','entitlement_policy_revisions','entitlement_policies','product_memberships','identity_audit_events','product_instances','memberships','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
   await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await admin.query('DELETE FROM users WHERE id=ANY($1)',[users]);await admin.query('DELETE FROM products WHERE id=$1',[product]);await admin.query(`DROP ROLE ${role}`);await admin.end();
  }
 });
});
