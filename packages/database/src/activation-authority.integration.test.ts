import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { createCanonicalId } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { enableProductInstance } from './product-instances.js';
import { requestProductConnection } from './product-connections.js';
import { claimProvisioningOperation, finishProvisioningAttempt } from './provisioning-operations.js';
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)('database activation authority',()=>{
 it('rejects a substituted authorized administrator for create and connect leases',async()=>{
  const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex'),role=`ch_activation_${suffix}`;
  const admin=new Client({connectionString:databaseUrl});await admin.connect();
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT company_human_provisioner TO ${role}`);
  const workerUrl=new URL(databaseUrl!);workerUrl.username=role;workerUrl.password=password;
  const sql=new Client({connectionString:workerUrl.toString()});await sql.connect();
  const users=await Promise.all(['original','substitute'].map(name=>syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`activation-${suffix}-${name}`,primaryEmail:null,displayName:name,status:'active',eventTimestamp:1})));
  const org=await createOrganization(databaseUrl!,{ownerUserId:users[0]!,slug:`activation-${suffix}`,name:'Activation fixture'});
  const scope={organizationId:org.organizationId,actorUserId:users[0]!},product=createCanonicalId('product');
  try{
   await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','admin')",[createCanonicalId('membership'),org.organizationId,users[1]]);
   const metadata={schemaVersion:1,description:'Test only',category:'sales',supportedCapabilities:[],provisioningModes:['connected','provisioned'],supportedMemberOperations:[],usageMeters:[],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
   await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`activation-${suffix}`,metadata]);
   for(const mode of ['provisioned','connected'] as const){
    const instance=await enableProductInstance(databaseUrl!,{...scope,productId:product,mode,instanceKey:mode});
    if(mode==='connected')await requestProductConnection(databaseUrl!,{...scope,productInstanceId:instance,externalOrganizationId:'fixture-target'});
    const lease=(await claimProvisioningOperation(workerUrl.toString(),scope,product))!;
    await admin.query("UPDATE memberships SET status='suspended' WHERE organization_id=$1 AND user_id=$2",[org.organizationId,users[0]]);
    await sql.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[users[1],org.organizationId]);
    expect((await sql.query("SELECT company_human_private.has_capability($1,'applications.manage') allowed",[org.organizationId])).rows[0].allowed).toBe(true);
    const fn=mode==='connected'?'activate_connected_instance':'activate_provisioned_instance';
    await expect(sql.query(`SELECT company_human_private.${fn}($1,$2,$3)`,[lease.operationId,lease.leaseToken,'fixture-target'])).rejects.toThrow('initiating authority');
    expect((await admin.query('SELECT external_organization_id FROM product_instances WHERE id=$1',[instance])).rows[0].external_organization_id).toBeNull();
    // Restoring the original user must preserve the valid, fenced execution path.
    await admin.query("UPDATE memberships SET status='active' WHERE organization_id=$1 AND user_id=$2",[org.organizationId,users[0]]);
    await finishProvisioningAttempt(workerUrl.toString(),scope,lease.operationId,lease.leaseToken,{status:'succeeded',providerReference:'fixture-target'},{activateInstance:true});
    expect((await admin.query('SELECT provisioning_status FROM product_instances WHERE id=$1',[instance])).rows[0].provisioning_status).toBe('active');
   }
  }finally{
   await sql.end();
   for(const table of ['provisioning_attempts','provisioning_operations','product_instances','identity_audit_events','memberships','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=$1`,[org.organizationId]);
   await admin.query('DELETE FROM organizations WHERE id=$1',[org.organizationId]);await admin.query('DELETE FROM users WHERE id=ANY($1)',[users]);await admin.query('DELETE FROM products WHERE id=$1',[product]);await admin.query(`DROP ROLE ${role}`);await admin.end();
  }
 });
});
