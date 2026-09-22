import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { describe,it,expect } from 'vitest';
import { createCanonicalId } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { setProductEntitlement } from './product-entitlements.js';
import { refreshCapabilitySnapshots } from './capability-preparer.js';
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)('restricted automatic capability preparation',()=>{
 it('refreshes bounded pages without a live initiating admin and atomically enqueues changed sources',async()=>{
  const suffix=randomBytes(6).toString('hex'),role=`ch_caps_${suffix}`,password=randomBytes(20).toString('hex');
  const preparerRole=`ch_preparer_${suffix}`;
  const admin=new Client({connectionString:databaseUrl});await admin.connect();await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_service TO ${role}`);
  await admin.query(`CREATE ROLE ${preparerRole} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_capability_preparer TO ${preparerRole}`);
  const url=new URL(databaseUrl!);url.username=role;url.password=password;const sql=new Client({connectionString:url.toString()});await sql.connect();
  const users=await Promise.all(['one','two'].map(name=>syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`caps-${suffix}-${name}`,primaryEmail:null,displayName:name,status:'active',eventTimestamp:1})));
  const org=await createOrganization(databaseUrl!,{ownerUserId:users[0]!,slug:`caps-a-${suffix}`,name:'A'}),other=await createOrganization(databaseUrl!,{ownerUserId:users[1]!,slug:`caps-b-${suffix}`,name:'B'});
  const orgs=[org.organizationId,other.organizationId],product=createCanonicalId('product'),instance=createCanonicalId('productInstance'),mapping=createCanonicalId('productMembership');
  const preparer=new URL(url);preparer.username=preparerRole;
  const input={organizationId:org.organizationId,productId:product};
  const member2=createCanonicalId('membership'),mapping2=createCanonicalId('productMembership');
  const metadata={schemaVersion:1,description:'Fixture only',category:'sales',supportedCapabilities:['read','write'],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:[],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
  try{
   await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`caps-${suffix}`,metadata]);
   await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active','fixture-org',$4)",[instance,org.organizationId,product,users[0]]);
   await admin.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,external_member_id,created_by_user_id) VALUES($1,$2,$3,$4,'suspended','fixture-member',$5)",[mapping,org.organizationId,instance,org.ownerMembershipId,users[0]]);
   const config={actorUserId:users[0]!,organizationId:org.organizationId,productInstanceId:instance,membershipId:null,capability:'read',effect:'allow' as const,expectedRevision:0};
   await setProductEntitlement(url.toString(),config);
   await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')",[member2,org.organizationId,users[1]]);
   await admin.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,external_member_id,created_by_user_id) VALUES($1,$2,$3,$4,'suspended','fixture-second',$5)",[mapping2,org.organizationId,instance,member2,users[0]]);
   await expect(refreshCapabilitySnapshots(url.toString(),input)).rejects.toThrow('restricted preparer');
   await expect(refreshCapabilitySnapshots(databaseUrl!,input)).rejects.toThrow('restricted preparer');
   await expect(refreshCapabilitySnapshots(preparer.toString(),{...input,limit:51})).rejects.toThrow();
   expect((await refreshCapabilitySnapshots(preparer.toString(),{...input,organizationId:other.organizationId})).scanned).toBe(0);
   expect((await refreshCapabilitySnapshots(preparer.toString(),{...input,productId:createCanonicalId('product')})).scanned).toBe(0);
   const page1=await refreshCapabilitySnapshots(preparer.toString(),{...input,limit:1});expect(page1.prepared).toBe(1);expect(page1.nextCursor).not.toBeNull();
   const page2=await refreshCapabilitySnapshots(preparer.toString(),{...input,limit:1,after:page1.nextCursor});expect(page2.prepared).toBe(1);expect(page2.nextCursor).toBeNull();
   const unchanged=await refreshCapabilitySnapshots(preparer.toString(),input);expect(unchanged).toEqual({scanned:2,prepared:0,reused:2,skipped:0,nextCursor:null});
   // Customizing the target contributor role must block preparation even though the owner still has product.use.
   const contributorRole=(await admin.query('SELECT role_id FROM memberships WHERE id=$1',[member2])).rows[0].role_id;
   await admin.query("DELETE FROM role_permissions WHERE organization_id=$1 AND role_id=$2 AND permission_key='product.use'",[org.organizationId,contributorRole]);
   expect(await refreshCapabilitySnapshots(preparer.toString(),input)).toEqual({scanned:2,prepared:0,reused:1,skipped:1,nextCursor:null});
   // A matching permission in another organization cannot authorize this target.
   expect((await admin.query("SELECT count(*)::int n FROM role_permissions WHERE organization_id=$1 AND permission_key='product.use'",[other.organizationId])).rows[0].n).toBeGreaterThan(0);
   await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,'product.use')",[org.organizationId,contributorRole]);
   expect((await refreshCapabilitySnapshots(preparer.toString(),input)).reused).toBe(2);
   await setProductEntitlement(url.toString(),{...config,effect:'deny',expectedRevision:1});
   const concurrent=await Promise.all(Array.from({length:3},()=>refreshCapabilitySnapshots(preparer.toString(),input)));
   expect(concurrent.reduce((n,r)=>n+r.prepared,0)).toBe(2);
   const snapshots=(await admin.query('SELECT policy_revision,payload,actor_user_id,actor_service_id FROM member_capability_snapshots WHERE organization_id=$1 ORDER BY policy_revision',[org.organizationId])).rows;
   expect(snapshots).toHaveLength(4);expect(snapshots.every(r=>r.actor_user_id===null&&r.actor_service_id==='capability-preparer')).toBe(true);
   expect(snapshots.filter(r=>r.policy_revision===2).every(r=>r.payload.capabilities.length===0)).toBe(true);
   expect((await admin.query('SELECT count(*)::int n FROM capability_jobs WHERE organization_id=$1',[org.organizationId])).rows[0].n).toBe(4);
   // An initiating administrator leaving cannot strand already authorized configuration for another active member.
   await setProductEntitlement(url.toString(),{...config,effect:'allow',expectedRevision:2});
   await admin.query("UPDATE memberships SET status='suspended' WHERE organization_id=$1 AND user_id=$2",[org.organizationId,users[0]]);
   const independent=await refreshCapabilitySnapshots(preparer.toString(),input);expect(independent.prepared).toBe(1);expect(independent.skipped).toBe(1);
   expect((await admin.query('SELECT max(policy_revision) n FROM member_capability_snapshots WHERE product_membership_id=$1',[mapping2])).rows[0].n).toBe(3);
   // A catalog change triggers a new snapshot without a preference mutation.
   await admin.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,{...metadata,supportedCapabilities:['write']}]);
   const guard=`prep_audit_${suffix}`;
   await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${mapping2}' AND NEW.action='product.capabilities.refreshed' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
   await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
   try{await expect(refreshCapabilitySnapshots(preparer.toString(),input)).rejects.toThrow('fixture audit failure');expect((await admin.query('SELECT max(policy_revision) n FROM capability_jobs WHERE product_membership_id=$1'.replace('policy_revision','revision'),[mapping2])).rows[0].n).toBe(3);}
   finally{await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await admin.query(`DROP FUNCTION public.${guard}()`);}
   expect((await refreshCapabilitySnapshots(preparer.toString(),input)).prepared).toBe(1);
   await admin.query('UPDATE product_instances SET desired_enabled=false WHERE id=$1',[instance]);expect((await refreshCapabilitySnapshots(preparer.toString(),input)).skipped).toBe(2);
   const runtime=new Client({connectionString:preparer.toString()});await runtime.connect();
   try{
    await runtime.query("SELECT set_config('company_human.organization_id',$1,false),set_config('company_human.product_id',$2,false)",[org.organizationId,product]);
    await expect(runtime.query("UPDATE product_memberships SET provisioning_status='active' WHERE id=$1",[mapping2])).rejects.toThrow('permission denied');
    await expect(runtime.query("UPDATE entitlement_policy_revisions SET effect='allow' WHERE organization_id=$1",[org.organizationId])).rejects.toThrow('permission denied');
    await expect(runtime.query('SELECT primary_email FROM users')).rejects.toThrow('permission denied');
    await expect(runtime.query("UPDATE capability_jobs SET status='succeeded' WHERE product_membership_id=$1",[mapping2])).rejects.toThrow('permission denied');
    await runtime.query("SELECT set_config('company_human.product_id',$1,false)",[createCanonicalId('product')]);expect((await runtime.query('SELECT * FROM member_capability_snapshots')).rowCount).toBe(0);
   }finally{await runtime.end();}
   const events=(await admin.query("SELECT actor_user_id,actor_service_id FROM identity_audit_events WHERE organization_id=$1 AND action='product.capabilities.refreshed'",[org.organizationId])).rows;
   expect(events).toHaveLength(6);expect(events.every(r=>r.actor_user_id===null&&r.actor_service_id==='capability-preparer')).toBe(true);
  }finally{
   await sql.end();for(const table of ['member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','product_membership_commands','capability_attempts','capability_jobs','member_capability_snapshots','entitlement_policy_revisions','entitlement_policies','product_memberships','identity_audit_events','product_instances','memberships','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
   await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await admin.query('DELETE FROM users WHERE id=ANY($1)',[users]);await admin.query('DELETE FROM products WHERE id=$1',[product]);await admin.query(`DROP ROLE ${preparerRole}`);await admin.query(`DROP ROLE ${role}`);await admin.end();
  }
 });
});
