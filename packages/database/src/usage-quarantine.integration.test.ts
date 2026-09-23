import { expect,it } from "vitest";
import { Client } from "pg";
import { createCanonicalId } from "@company-human/contracts";
import { releaseUsageInTransaction } from "./usage-quarantine.js";
import { aggregateUsageInTransaction } from "./usage-aggregation.js";
const url=process.env.DATABASE_URL;
it.skipIf(!url)('releases only exact registered quarantined usage with immutable authorized provenance and no double counting',async()=>{
 const db=new Client({connectionString:url});await db.connect();await db.query('BEGIN');
 try {
  const user=createCanonicalId('user'),memberUser=createCanonicalId('user'),org=createCanonicalId('organization'),otherOrg=createCanonicalId('organization'),member=createCanonicalId('membership'),product=createCanonicalId('product'),instance=createCanonicalId('productInstance'),event=createCanonicalId('event');
  for(const id of [user,memberUser])await db.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://recovery.test',$1,'Recovery','active',1)",[id]);
  for(const id of [org,otherOrg])await db.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,replace($1,'_','-'),'Recovery',$2)",[id,user]);
  for(const [key,actor,membership] of [['owner',user,createCanonicalId('membership')],['contributor',memberUser,member]]) {
   const role=createCanonicalId('role');
   await db.query('INSERT INTO roles(id,organization_id,key) VALUES($1,$2,$3)',[role,org,key]);
   await db.query('INSERT INTO role_permissions(organization_id,role_id,permission_key) SELECT $1,$2,permission_key FROM role_permission_defaults WHERE role_key=$3',[org,role,key]);
   await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,$4,'active')",[membership,org,actor,key]);
  }
  await db.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'Recovery')",[product,`recovery-${crypto.randomUUID()}`]);
  await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,'recovery','connected',$4)",[instance,org,product,user]);
  await db.query(`INSERT INTO usage_events(event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,idempotency_key,membership_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,disposition,envelope,signature)
   VALUES($1,$2,$3,$4,'test','fixture','source','idem',$5,'leads',1,2.125,'lead','2026-01-02','2026-01-03','quarantined','{"fixture":"original"}','{"fixture":"signature"}')`,[event,org,product,instance,member]);
  const input={actorUserId:user,organizationId:org,eventId:event,reason:'Meter registration corrected'};
  await expect(releaseUsageInTransaction(db,input)).rejects.toThrow('restricted service');
  const denied=async(actor:string,organization:string,message:string)=>{
   await db.query('SET LOCAL ROLE company_human_service');await db.query('SAVEPOINT denied');
   await expect(releaseUsageInTransaction(db,{...input,actorUserId:actor,organizationId:organization})).rejects.toThrow(message);
   await db.query('ROLLBACK TO SAVEPOINT denied');await db.query('RESET ROLE');
  };
  await denied(memberUser,org,'denied');await denied(user,otherOrg,'denied');await denied(user,org,'Exact meter');
  await db.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'leads',2,'lead','sum','Leads')",[product]);
  await denied(user,org,'Exact meter');
  await db.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'leads',1,'lead','sum','Leads')",[product]);
  const window={organizationId:org,environment:'test' as const,from:'2026-01-01T00:00:00Z',until:'2026-02-01T00:00:00Z',breakdown:'product' as const};
  await db.query('SET LOCAL ROLE company_human_app');expect(await aggregateUsageInTransaction(db,memberUser,window)).toEqual([]);
  await db.query('SET LOCAL ROLE company_human_service');
  expect(await releaseUsageInTransaction(db,input)).toEqual({released:true});
  expect(await releaseUsageInTransaction(db,{...input,reason:'Retry must not overwrite original reason'})).toEqual({released:false});
  const receipts=await db.query('SELECT actor_user_id,reason,released_at FROM usage_quarantine_releases WHERE event_id=$1',[event]);
  expect(receipts.rowCount).toBe(1);expect(receipts.rows[0]).toMatchObject({actor_user_id:user,reason:input.reason});expect(receipts.rows[0].released_at).toBeInstanceOf(Date);
  await db.query('SAVEPOINT forgery');await expect(db.query('INSERT INTO usage_quarantine_releases(event_id,organization_id,actor_user_id,reason) VALUES($1,$2,$3,$4)',[event,org,user,'forged'])).rejects.toThrow('permission denied');await db.query('ROLLBACK TO SAVEPOINT forgery');
  await db.query('SET LOCAL ROLE company_human_app');
  expect(await aggregateUsageInTransaction(db,memberUser,window)).toEqual([expect.objectContaining({quantity:'2.125000',eventCount:'1'})]);
  expect(await aggregateUsageInTransaction(db,memberUser,{...window,organizationId:otherOrg})).toEqual([]);
  await db.query('RESET ROLE');
  expect((await db.query('SELECT disposition,envelope,signature FROM usage_events WHERE event_id=$1',[event])).rows[0]).toEqual({disposition:'quarantined',envelope:{fixture:'original'},signature:{fixture:'signature'}});
  await db.query('SAVEPOINT immutable');await expect(db.query("UPDATE usage_quarantine_releases SET reason='rewrite' WHERE event_id=$1",[event])).rejects.toThrow('immutable');await db.query('ROLLBACK TO SAVEPOINT immutable');
  await db.query("UPDATE memberships SET status='suspended' WHERE user_id=$1",[user]);await denied(user,org,'denied');
 }finally{await db.query('ROLLBACK');await db.end();}
});
