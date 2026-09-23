import { expect,it } from "vitest";
import { Client } from "pg";
import { createCanonicalId } from "@company-human/contracts";
import { aggregateUsageInTransaction, type UsageWindow } from "./usage-aggregation.js";
const url=process.env.DATABASE_URL;
it.skipIf(!url)("aggregates exact occurrence windows with deterministic gauges and enforced own/team/tenant access",async()=>{
 const db=new Client({connectionString:url});await db.connect();await db.query("BEGIN");
 try {
  const owner=createCanonicalId("user"),contributor=createCanonicalId("user"),manager=createCanonicalId("user");
  const org=createCanonicalId("organization"),foreign=createCanonicalId("organization"),product=createCanonicalId("product"),instance=createCanonicalId("productInstance"),instance2=createCanonicalId("productInstance"),foreignInstance=createCanonicalId("productInstance");
  const ownMember=createCanonicalId("membership"),member=createCanonicalId("membership"),managerMember=createCanonicalId("membership"),team=createCanonicalId("team"),otherTeam=createCanonicalId("team");
  for (const user of [owner,contributor,manager]) await db.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://usage.test',$1,'Usage reader','active',1)",[user]);
  for (const id of [org,foreign]) await db.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,$3,'Usage window test',$2)",[id,owner,id.replaceAll('_','-')]);
  for (const [id,key] of [[ownMember,'owner'],[member,'contributor'],[managerMember,'manager']] as const) {
   const role=createCanonicalId("role");
   await db.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,$3)",[role,org,key]);
   await db.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) SELECT $1,$2,permission_key FROM role_permission_defaults WHERE role_key=$3",[org,role,key]);
   await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,$4,'active')",[id,org,key==='owner'?owner:key==='contributor'?contributor:manager,key]);
  }
  for (const t of [team,otherTeam]) await db.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,$1)",[t,org]);
  await db.query("INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role) VALUES($1,$2,$3,'manager')",[org,team,managerMember]);
  await db.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'Usage')",[product,`usage-${crypto.randomUUID()}`]);
  for (const [id,organization] of [[instance,org],[instance2,org],[foreignInstance,foreign]]) await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,created_by_user_id) VALUES($1,$2,$3,replace($1,'_','-'),'connected',$4)",[id,organization,product,owner]);
  for (const [key,version,unit,aggregation] of [['leads',1,'lead','sum'],['leads',2,'credit','sum'],['capacity',1,'hour','maximum'],['storage',1,'byte','last']]) await db.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,$2,$3,$4,$5,$2)",[product,key,version,unit,aggregation]);
  let sequence=0;
  const insert=async(quantity:string, options:Partial<{key:string;version:number;unit:string;membership:string|null;team:string|null;capability:string|null;instance:string;org:string;environment:string;occurred:string;reported:string;disposition:string;eventId:string}>={})=>{
   const n=String(++sequence), eventId=options.eventId??createCanonicalId("event");
   await db.query(`INSERT INTO usage_events(event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,idempotency_key,membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,disposition,envelope,signature)
     VALUES($1,$2,$3,$4,$5,'fixture',$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'{}')`,[eventId,options.org??org,product,options.instance??instance,options.environment??'test',n,options.membership===undefined?member:options.membership,options.team===undefined?team:options.team,options.key??'leads',options.version??1,quantity,options.unit??'lead',options.occurred??'2026-01-02T00:00:00Z',options.reported??'2026-01-03T00:00:00Z',options.disposition??'accepted',JSON.stringify({payload:{capabilityKey:options.capability??null}})]);
  };
  await insert('0.1');await insert('0.2');await insert('999999999999.999999',{instance:instance2,membership:ownMember,team:otherTeam});
  await insert('8',{membership:null,team:null});await insert('7',{version:2,unit:'credit'});
  await insert('400',{environment:'production'});await insert('500',{disposition:'quarantined'});
  await insert('600',{occurred:'2026-02-01T00:00:00Z'});await insert('700',{occurred:'2025-12-31T23:59:59Z'});
  await insert('800',{org:foreign,instance:foreignInstance,membership:null,team:null});
  await insert('3',{key:'capacity',unit:'hour'});await insert('2',{key:'capacity',unit:'hour'});
  await insert('9',{key:'storage',unit:'byte',occurred:'2026-01-03T00:00:00Z',eventId:'ch_evt_00000000000000000000000000000001'});
  await insert('4',{key:'storage',unit:'byte',occurred:'2026-01-03T00:00:00Z',eventId:'ch_evt_00000000000000000000000000000002'});
  await insert('99',{key:'storage',unit:'byte',occurred:'2026-01-01T00:00:00Z',reported:'2026-03-01T00:00:00Z'});
  const window:UsageWindow={organizationId:org,environment:'test',from:'2026-01-01T00:00:00Z',until:'2026-02-01T00:00:00Z',breakdown:'organization'};
  await expect(aggregateUsageInTransaction(db,owner,window)).rejects.toThrow('restricted reader');
  await db.query('SET LOCAL ROLE company_human_app');
  const rows=await aggregateUsageInTransaction(db,owner,window);
  expect(rows.find(r=>r.meterKey==='leads'&&r.meterVersion===1)).toMatchObject({quantity:'1000000000008.299999',eventCount:'4',productName:'Usage',meterName:'leads'});
  expect(rows.find(r=>r.meterVersion===2)).toMatchObject({quantity:'7.000000',unit:'credit'});
  expect(rows.find(r=>r.meterKey==='capacity')).toMatchObject({quantity:'3.000000',aggregation:'maximum'});
  expect(rows.find(r=>r.meterKey==='storage')).toMatchObject({quantity:'4.000000',aggregation:'last'});
  const mine=await aggregateUsageInTransaction(db,contributor,window);
  expect(mine.find(r=>r.meterKey==='leads'&&r.meterVersion===1)?.quantity).toBe('0.300000');
  expect(await aggregateUsageInTransaction(db,contributor,{...window,membershipId:ownMember})).toEqual([]);
  expect(await aggregateUsageInTransaction(db,owner,{...window,organizationId:foreign})).toEqual([]);
  expect((await aggregateUsageInTransaction(db,owner,{...window,environment:'production'}))[0]?.quantity).toBe('400.000000');
  expect((await aggregateUsageInTransaction(db,owner,{...window,breakdown:'instance'})).filter(r=>r.meterKey==='leads'&&r.meterVersion===1)).toHaveLength(2);
  expect((await aggregateUsageInTransaction(db,owner,{...window,breakdown:'member'})).filter(r=>r.meterKey==='leads'&&r.meterVersion===1)).toHaveLength(3);
  expect((await aggregateUsageInTransaction(db,owner,{...window,breakdown:'team'})).filter(r=>r.meterKey==='leads'&&r.meterVersion===1)).toHaveLength(3);
  expect((await aggregateUsageInTransaction(db,manager,window)).find(r=>r.meterKey==='leads'&&r.meterVersion===1)?.quantity).toBe('0.300000');
  await db.query('SAVEPOINT private_columns');await expect(db.query('SELECT envelope FROM usage_events')).rejects.toThrow('permission denied');await db.query('ROLLBACK TO SAVEPOINT private_columns');
  await db.query('RESET ROLE');
  // A delayed report updates the occurrence window without altering any earlier event.
  await insert('1.1',{reported:'2026-03-01T00:00:00Z'});
  await db.query("UPDATE team_memberships SET ended_at=now() WHERE membership_id=$1",[managerMember]);
  await db.query('SET LOCAL ROLE company_human_app');
  expect(await aggregateUsageInTransaction(db,manager,window)).toEqual([]);
  expect((await aggregateUsageInTransaction(db,contributor,window)).find(r=>r.meterKey==='leads'&&r.meterVersion===1)?.quantity).toBe('1.400000');
  await db.query('RESET ROLE');await db.query("UPDATE memberships SET status='suspended' WHERE id=$1",[member]);await db.query('SET LOCAL ROLE company_human_app');
  expect(await aggregateUsageInTransaction(db,contributor,window)).toEqual([]);
  await expect(aggregateUsageInTransaction(db,owner,{...window,until:window.from})).rejects.toThrow('Invalid usage window');
  await db.query('RESET ROLE');
  await db.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'capability-test',1,'unit','sum','Capability test')",[product]);
  await insert('2',{key:'capability-test',unit:'unit',capability:'outbound-enrichment',membership:ownMember,team:null});
  await insert('3',{key:'capability-test',unit:'unit',capability:'image-generation',membership:ownMember,team:null});
  await insert('1',{key:'capability-test',unit:'unit',capability:null,membership:ownMember,team:null});
  await db.query('SET LOCAL ROLE company_human_app');
  const combined=(await aggregateUsageInTransaction(db,owner,window)).find(r=>r.meterKey==='capability-test');
  expect(combined).toMatchObject({quantity:'6.000000',eventCount:'3',capabilityKey:null});
  const capabilityRows=(await aggregateUsageInTransaction(db,owner,{...window,breakdown:'capability'}))
    .filter(r=>r.meterKey==='capability-test');
  expect(capabilityRows.map(r=>[r.capabilityKey,r.quantity])).toEqual([
    [null,'1.000000'],['image-generation','3.000000'],['outbound-enrichment','2.000000'],
  ]);
  expect((await aggregateUsageInTransaction(db,owner,{...window,breakdown:'capability',capabilityKey:'outbound-enrichment'}))
    .filter(r=>r.meterKey==='capability-test')).toMatchObject([{capabilityKey:'outbound-enrichment',quantity:'2.000000'}]);
  await expect(aggregateUsageInTransaction(db,owner,{...window,capabilityKey:'outbound-enrichment'}))
    .rejects.toThrow('Capability filter requires capability breakdown');
  await db.query('RESET ROLE');
  await db.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'capability-peak',1,'unit','maximum','Capability peak'),($1,'capability-latest',1,'unit','last','Capability latest')",[product]);
  await insert('5',{key:'capability-peak',unit:'unit',capability:'outbound-enrichment',membership:ownMember,team:null});
  await insert('8',{key:'capability-peak',unit:'unit',capability:'image-generation',membership:ownMember,team:null});
  await insert('2',{key:'capability-latest',unit:'unit',capability:'outbound-enrichment',membership:ownMember,team:null,occurred:'2026-01-02T00:00:00Z'});
  await insert('3',{key:'capability-latest',unit:'unit',capability:'image-generation',membership:ownMember,team:null,occurred:'2026-01-03T00:00:00Z'});
  await db.query('SET LOCAL ROLE company_human_app');
  const combinedGauges=await aggregateUsageInTransaction(db,owner,window);
  expect(combinedGauges.find(r=>r.meterKey==='capability-peak')).toMatchObject({quantity:'8.000000',capabilityKey:null});
  expect(combinedGauges.find(r=>r.meterKey==='capability-latest')).toMatchObject({quantity:'3.000000',capabilityKey:null});
  const splitGauges=await aggregateUsageInTransaction(db,owner,{...window,breakdown:'capability'});
  expect(splitGauges.filter(r=>r.meterKey==='capability-peak').map(r=>[r.capabilityKey,r.quantity]))
    .toEqual([['image-generation','8.000000'],['outbound-enrichment','5.000000']]);
  expect(splitGauges.filter(r=>r.meterKey==='capability-latest').map(r=>[r.capabilityKey,r.quantity]))
    .toEqual([['image-generation','3.000000'],['outbound-enrichment','2.000000']]);
  await expect(aggregateUsageInTransaction(db,owner,{...window,capabilityKey:'not valid'})).rejects.toThrow();
 } finally {await db.query('ROLLBACK');await db.end();}
});
