import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { createCanonicalId, PRODUCT_ADAPTER_METHODS, assertProductAdapterV1, type ProductAdapterV1 } from '@company-human/contracts';
import { syncAuthUser } from './auth-users.js';
import { createOrganization } from './organizations.js';
import { collectApplicationHealth } from './application-health.js';
import { readApplicationHealth } from './administration.js';
const databaseUrl=process.env.DATABASE_URL;
function adapter(getHealth:ProductAdapterV1['getHealth']):ProductAdapterV1{
 const value={contractVersion:1,...Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(name=>[name,async()=>{throw new Error(`Unexpected ${name}`);} ])),getHealth};assertProductAdapterV1(value);return value;
}
describe.skipIf(!databaseUrl)('restricted application health observations',()=>{
 it('isolates collection, preserves failures, filters obsolete bindings and rolls back without audit',async()=>{
  const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex');
  const workerRole=`ch_hw_${suffix}`,serviceRole=`ch_hs_${suffix}`;
  const admin=new Client({connectionString:databaseUrl});await admin.connect();
  for(const [role,grant] of [[workerRole,'company_human_health_worker'],[serviceRole,'company_human_service']]){await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await admin.query(`GRANT ${grant} TO ${role}`);}
  const worker=new URL(databaseUrl!);worker.username=workerRole;worker.password=password;
  const service=new URL(worker);service.username=serviceRole;
  const owner=await syncAuthUser(databaseUrl!,{authIssuer:'https://identity.example.test',authSubject:`health-${suffix}`,primaryEmail:null,displayName:'Health fixture',status:'active',eventTimestamp:1});
  const org=await createOrganization(databaseUrl!,{ownerUserId:owner,name:'Health fixture',slug:`health-${suffix}`});
  const other=await createOrganization(databaseUrl!,{ownerUserId:owner,name:'Other health',slug:`health-other-${suffix}`});
  const product=createCanonicalId('product'),instance=createCanonicalId('productInstance');
  const scope={organizationId:org.organizationId,productInstanceId:instance};
  const good=adapter(async()=>({status:'succeeded',value:{status:'healthy',checkedAt:new Date().toISOString(),affectedMembers:0,providerStatus:'private-provider-detail'}}));
  const run=(a=good)=>collectApplicationHealth(worker.toString(),scope,{productId:product,adapter:a});
  const read=()=>readApplicationHealth(service.toString(),owner,org.organizationId,instance);
  const sql=new Client({connectionString:worker.toString()});await sql.connect();
  try{
   await admin.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'Health fixture')",[product,`health-${suffix}`]);
   await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active','health-target',$4)",[instance,org.organizationId,product,owner]);
   expect(await read()).toBeNull();
   await expect(collectApplicationHealth(service.toString(),scope,{productId:product,adapter:good})).rejects.toThrow('restricted worker');
   await expect(collectApplicationHealth(databaseUrl!,scope,{productId:product,adapter:good})).rejects.toThrow('restricted worker');
   let called=false;const trap=adapter(async()=>{called=true;throw new Error('Should not call');});
   expect(await collectApplicationHealth(worker.toString(),{...scope,organizationId:other.organizationId},{productId:product,adapter:trap})).toBe('unavailable');
   expect(await collectApplicationHealth(worker.toString(),scope,{productId:createCanonicalId('product'),adapter:trap})).toBe('unavailable');expect(called).toBe(false);
   expect(await run()).toBe('recorded');const healthy=await read();expect(healthy?.assessment?.state).toBe('current');expect(JSON.stringify(healthy)).not.toContain('private-provider-detail');
   expect((await admin.query('SELECT health FROM application_health_observations WHERE product_instance_id=$1',[instance])).rows[0].health).not.toHaveProperty('providerStatus');
   await run(adapter(async()=>{throw new Error('secret-exception');}));expect((await read())?.failureCode).toBe('adapter_transport_failure');expect((await read())?.assessment).toBeNull();
   await run(adapter(async()=>({status:'permanent_failure',code:'authentication_required'})));expect((await read())?.failureCode).toBe('authentication_required');
   await run(adapter(async()=>({status:'succeeded',value:{status:'healthy',checkedAt:'2099-01-01T00:00:00Z'}})));expect((await read())?.failureCode).toBe('future_observation');
   await run(adapter(async()=>({status:'succeeded',value:{status:'healthy',checkedAt:'2000-01-01T00:00:00Z'}})));expect((await read())?.assessment?.state).toBe('stale');
   // Retirement during collection invalidates the result. Legacy observations with another binding are not current.
   expect(await run(adapter(async()=>{await admin.query("UPDATE products SET catalog_status='retired' WHERE id=$1",[product]);return {status:'succeeded',value:{status:'healthy',checkedAt:new Date().toISOString()}};}))).toBe('superseded');
   await admin.query("UPDATE products SET catalog_status='ready' WHERE id=$1",[product]);
   await admin.query("UPDATE application_health_observations SET external_organization_id='old-binding' WHERE product_instance_id=$1",[instance]);
   expect(await read()).toBeNull();await run();expect((await read())?.assessment?.state).toBe('current');
   // A slow older check must not displace a newer-started observation when it finishes last.
   let releaseOlder: (()=>void) | undefined;
   let announceOlder: (()=>void) | undefined;
   const olderStarted=new Promise<void>(resolve=>{announceOlder=resolve;});
   const older=run(adapter(()=>new Promise(resolve=>{releaseOlder=()=>resolve({status:'succeeded',value:{status:'degraded',checkedAt:new Date().toISOString()}});announceOlder!();})));
   await olderStarted;await run();releaseOlder!();expect(await older).toBe('recorded');
   const newest=(await read())?.assessment;expect(newest?.state).toBe('current');
   if(newest && newest.state!=='unknown')expect(newest.observation.status).toBe('healthy');
   const count=Number((await admin.query('SELECT count(*) FROM application_health_observations WHERE product_instance_id=$1',[instance])).rows[0].count);
   await admin.query(`CREATE FUNCTION public.reject_health_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_service_id='health-worker' AND NEW.organization_id='${org.organizationId}' THEN RAISE EXCEPTION 'fixture audit rejection'; END IF; RETURN NEW; END $$`);
   await admin.query(`CREATE TRIGGER reject_health_${suffix} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_health_${suffix}()`);
   try{await expect(run()).rejects.toThrow('fixture audit rejection');}finally{await admin.query(`DROP TRIGGER reject_health_${suffix} ON identity_audit_events`);await admin.query(`DROP FUNCTION public.reject_health_${suffix}()`);}
   expect(Number((await admin.query('SELECT count(*) FROM application_health_observations WHERE product_instance_id=$1',[instance])).rows[0].count)).toBe(count);
   await sql.query("SELECT set_config('company_human.organization_id',$1,false),set_config('company_human.product_id',$2,false)",[org.organizationId,product]);
   await expect(sql.query("UPDATE product_instances SET provisioning_status='active' WHERE id=$1",[instance])).rejects.toThrow('permission denied');
   await expect(sql.query('DELETE FROM application_health_observations')).rejects.toThrow('permission denied');
   await expect(sql.query('UPDATE application_health_observations SET health=NULL')).rejects.toThrow('permission denied');
   await sql.query("SELECT set_config('company_human.product_id',$1,false)",[createCanonicalId('product')]);expect((await sql.query('SELECT * FROM application_health_observations')).rowCount).toBe(0);
   await expect(readApplicationHealth(service.toString(),owner,other.organizationId,instance)).rejects.toThrow('denied');
  }finally{
   await sql.end();await admin.query('DELETE FROM application_health_observations WHERE organization_id=ANY($1)',[[org.organizationId,other.organizationId]]);
   await admin.query('DELETE FROM product_instances WHERE id=$1',[instance]);await admin.query('DELETE FROM products WHERE id=$1',[product]);
   for(const table of ['identity_audit_events','memberships','roles'])await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[[org.organizationId,other.organizationId]]);
   await admin.query('DELETE FROM organizations WHERE id=ANY($1)',[[org.organizationId,other.organizationId]]);await admin.query('DELETE FROM users WHERE id=$1',[owner]);
   await admin.query(`DROP ROLE ${workerRole}`);await admin.query(`DROP ROLE ${serviceRole}`);await admin.end();
  }
 });
});
