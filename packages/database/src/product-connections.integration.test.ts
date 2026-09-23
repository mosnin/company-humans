import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { describe,expect,it } from 'vitest';
import { createCanonicalId,assertProductAdapterV1,PRODUCT_ADAPTER_METHODS,type ProductAdapterV1 } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { enableProductInstance } from './product-instances.js';
import { requestProductConnection } from './product-connections.js';
import { claimProvisioningOperation,finishProvisioningAttempt } from './provisioning-operations.js';
import { dispatchProvisioningOperation } from './provisioning-dispatcher.js';
const databaseUrl=process.env.DATABASE_URL;
function adapter(connectOrganization:ProductAdapterV1['connectOrganization']):ProductAdapterV1{
 const result={contractVersion:1,...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(name=>[name,async()=>{throw new Error(`Unexpected ${name}`);}])) ,connectOrganization};assertProductAdapterV1(result);return result;
}
describe.skipIf(!databaseUrl)('existing product organization connections',()=>{
 it('queues immutable tenant-scoped intent and binds only the exact active provider result',async()=>{
  const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex'),serviceRole=`ch_conn_s_${suffix}`,workerRole=`ch_conn_w_${suffix}`;
  const admin=new Client({connectionString:databaseUrl});await admin.connect();
  for(const [role,grant]of[[serviceRole,'company_human_service'],[workerRole,'company_human_provisioner']]){await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT ${grant} TO ${role}`);}
  const service=new URL(databaseUrl!);service.username=serviceRole;service.password=password;const worker=new URL(service);worker.username=workerRole;
  const owner=await syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`conn-${suffix}`,primaryEmail:null,displayName:'Connection fixture',status:'active',eventTimestamp:1});
  const org=await createOrganization(databaseUrl!,{ownerUserId:owner,slug:`conn-${suffix}`,name:'Connection fixture'}),foreign=await createOrganization(databaseUrl!,{ownerUserId:owner,slug:`conn-foreign-${suffix}`,name:'Foreign fixture'});
  const orgs=[org.organizationId,foreign.organizationId],product=createCanonicalId('product'),scope={actorUserId:owner,organizationId:org.organizationId};
  const metadata={schemaVersion:1,description:'Test only',category:'sales',supportedCapabilities:['enrich'],provisioningModes:['connected'],supportedMemberOperations:['provision','suspend'],usageMeters:['leads'],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:['service-credential']};
  const sql=new Client({connectionString:service.toString()});await sql.connect();
  const setup=async(key:string)=>enableProductInstance(service.toString(),{...scope,productId:product,mode:'connected',instanceKey:key});
  const request=(id:string,target='fixture-target')=>requestProductConnection(service.toString(),{...scope,productInstanceId:id,externalOrganizationId:target});
  const dispatch=(a:ProductAdapterV1)=>dispatchProvisioningOperation(worker.toString(),scope,{productId:product,adapter:a});
  try{
   await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`conn-${suffix}`,metadata]);
   const instance=await setup('primary');
   const concurrent=await Promise.all(Array.from({length:5},()=>request(instance)));expect(new Set(concurrent).size).toBe(1);const operation=concurrent[0]!;
   expect((await admin.query("SELECT count(*)::int n FROM identity_audit_events WHERE target_id=$1 AND action='product.connection.requested'",[instance])).rows[0].n).toBe(1);
   expect((await admin.query('SELECT external_organization_id FROM product_instances WHERE id=$1',[instance])).rows[0].external_organization_id).toBeNull();
   await expect(request(instance,'changed-target')).rejects.toThrow('cannot change');
   await expect(requestProductConnection(service.toString(),{...scope,organizationId:foreign.organizationId,productInstanceId:instance,externalOrganizationId:'fixture-target'})).rejects.toThrow('unavailable');
   await expect(request(instance,'')).rejects.toThrow();await expect(request(instance,'x'.repeat(257))).rejects.toThrow();
   await sql.query("SELECT set_config('company_human.user_id',$1,false),set_config('company_human.organization_id',$2,false)",[owner,org.organizationId]);
   await expect(sql.query("UPDATE provisioning_operations SET requested_external_organization_id='forged' WHERE id=$1",[operation])).rejects.toThrow('permission denied');
   await expect(sql.query('SELECT company_human_private.activate_connected_instance($1,gen_random_uuid(),$2)',[operation,'fixture-target'])).rejects.toThrow('permission denied');
   let calls=0;const expected=adapter(async input=>{calls++;expect(input.externalOrganizationId).toBe('fixture-target');expect(input.organizationId).toBe(org.organizationId);expect(input.idempotencyKey).toBe(`${instance}:connect:v1`);return calls===1?{status:'pending',operationId:'fixture-operation'}:{status:'succeeded',value:{externalOrganizationId:input.externalOrganizationId,status:'active'}};});
   await expect(dispatchProvisioningOperation(service.toString(),scope,{productId:product,adapter:expected})).rejects.toThrow('restricted provisioner');
   expect(await dispatchProvisioningOperation(worker.toString(),scope,{productId:createCanonicalId('product'),adapter:expected})).toBe('idle');
   expect(await dispatch(expected)).toBe('processed');expect(calls).toBe(1);
   expect((await admin.query('SELECT provisioning_status FROM product_instances WHERE id=$1',[instance])).rows[0].provisioning_status).toBe('pending');
   await admin.query("UPDATE provisioning_operations SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[operation]);await dispatch(expected);expect(calls).toBe(2);
   expect((await admin.query('SELECT provisioning_status,external_organization_id FROM product_instances WHERE id=$1',[instance])).rows[0]).toEqual({provisioning_status:'active',external_organization_id:'fixture-target'});
   expect(await dispatch(expected)).toBe('idle');
   const wrong=await setup('wrong');const wrongOp=await request(wrong);
   await dispatch(adapter(async()=>({status:'succeeded',value:{externalOrganizationId:'foreign-target',status:'active'}})));
   expect((await admin.query('SELECT status,failure_code FROM provisioning_operations WHERE id=$1',[wrongOp])).rows[0]).toEqual({status:'failed',failure_code:'provider_organization_mismatch'});
   expect((await admin.query('SELECT external_organization_id FROM product_instances WHERE id=$1',[wrong])).rows[0].external_organization_id).toBeNull();
   const inactive=await setup('inactive');const inactiveOp=await request(inactive);
   await dispatch(adapter(async()=>({status:'succeeded',value:{externalOrganizationId:'fixture-target',status:'suspended'}})));
   expect((await admin.query('SELECT failure_code FROM provisioning_operations WHERE id=$1',[inactiveOp])).rows[0].failure_code).toBe('provider_organization_not_active');
   // Even bypassing the dispatcher cannot bind a mismatched target through SQL.
   const guarded=await setup('guarded');await request(guarded);const guardedLease=(await claimProvisioningOperation(worker.toString(),scope,product))!;
   await expect(finishProvisioningAttempt(worker.toString(),{...scope,actorUserId:createCanonicalId('user')},guardedLease.operationId,guardedLease.leaseToken,{status:'succeeded',providerReference:'fixture-target'},{activateInstance:true})).rejects.toThrow('Stale');
   await expect(finishProvisioningAttempt(worker.toString(),scope,guardedLease.operationId,guardedLease.leaseToken,{status:'succeeded',providerReference:'wrong-direct-target'},{activateInstance:true})).rejects.toThrow('mismatched connection');
   expect((await admin.query('SELECT external_organization_id FROM product_instances WHERE id=$1',[guarded])).rows[0].external_organization_id).toBeNull();
   await finishProvisioningAttempt(worker.toString(),scope,guardedLease.operationId,guardedLease.leaseToken,{status:'succeeded',providerReference:'fixture-target'},{activateInstance:true});
   // Failure of the initiating audit rolls back the queued request.
   const audited=await setup('audit');const guard=`conn_audit_${suffix}`;
   await admin.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${audited}' AND NEW.action='product.connection.requested' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
   await admin.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
   try{await expect(request(audited)).rejects.toThrow('fixture audit failure');expect((await admin.query('SELECT * FROM provisioning_operations WHERE product_instance_id=$1',[audited])).rowCount).toBe(0);}
   finally{await admin.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await admin.query(`DROP FUNCTION public.${guard}()`);}
   // Revocation while a provider call is in flight prevents local binding.
   const revoked=await setup('revoked');await request(revoked);
   expect(await dispatch(adapter(async()=>{await admin.query('UPDATE product_instances SET desired_enabled=false WHERE id=$1',[revoked]);return {status:'succeeded',value:{externalOrganizationId:'fixture-target',status:'active'}};}))).toBe('processed');
   expect((await admin.query('SELECT failure_code,provider_reference FROM provisioning_operations WHERE product_instance_id=$1',[revoked])).rows[0]).toEqual({failure_code:'activation_denied_reconciliation_required',provider_reference:'fixture-target'});
   expect((await admin.query('SELECT external_organization_id FROM product_instances WHERE id=$1',[revoked])).rows[0].external_organization_id).toBeNull();
   await expect(request(revoked)).rejects.toThrow('unavailable');
   // SQL activation rejection after the initial permission check also preserves the receipt.
   const retired=await setup('retired');const retiredOp=await request(retired);
   expect(await dispatch(adapter(async()=>{await admin.query("UPDATE products SET catalog_status='retired' WHERE id=$1",[product]);return {status:'succeeded',value:{externalOrganizationId:'fixture-target',status:'active'}};}))).toBe('processed');
   expect((await admin.query('SELECT status,failure_code,provider_reference FROM provisioning_operations WHERE id=$1',[retiredOp])).rows[0]).toEqual({status:'failed',failure_code:'activation_denied_reconciliation_required',provider_reference:'fixture-target'});
   expect((await admin.query('SELECT external_organization_id FROM product_instances WHERE id=$1',[retired])).rows[0].external_organization_id).toBeNull();
   await admin.query("UPDATE products SET catalog_status='ready' WHERE id=$1",[product]);
   const unsupported=await setup('unsupported');await admin.query('UPDATE products SET catalog_metadata=NULL WHERE id=$1',[product]);await expect(request(unsupported)).rejects.toThrow('unavailable');
  }finally{
   await sql.end();for(const table of ['provisioning_attempts','provisioning_operations','product_instances','identity_audit_events','memberships','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
   await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await admin.query('DELETE FROM users WHERE id=$1',[owner]);await admin.query('DELETE FROM products WHERE id=$1',[product]);for(const role of [serviceRole,workerRole])await admin.query(`DROP ROLE ${role}`);await admin.end();
  }
 });
});
