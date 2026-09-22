import { expect, it } from 'vitest';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { createCanonicalId } from '@company-human/contracts';
const url = process.env.DATABASE_URL;
async function fixture(db: Client) {
 const user=createCanonicalId('user'),other=createCanonicalId('user'),product=createCanonicalId('product');
 for(const id of [user,other]) await db.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://offboard.test',$1,'Person','active',1)",[id]);
 await db.query("INSERT INTO products(id,product_key,display_name) VALUES($1,replace($1,'_','-'),'Product')",[product]);
 const organizations: string[]=[],members: string[]=[],instances: string[]=[],mappings: string[]=[];
 for(let n=0;n<2;n++) {
  const org=createCanonicalId('organization'),member=createCanonicalId('membership'),instance=createCanonicalId('productInstance'),mapping=createCanonicalId('productMembership'),role=createCanonicalId('role');
  organizations.push(org);members.push(member);instances.push(instance);mappings.push(mapping);
  await db.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,replace($1,'_','-'),'Offboarding',$2)",[org,other]);
  await db.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,'contributor')",[role,org]);
  await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'contributor','active')",[member,org,user]);
  await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active',$1,$4)",[instance,org,product,other]);
  await db.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id) VALUES($1,$2,$3,$4,$5)",[mapping,org,instance,member,other]);
 }
 const otherMember=createCanonicalId('membership'),otherMapping=createCanonicalId('productMembership');
 await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'contributor','active')",[otherMember,organizations[0],other]);
 await db.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id) VALUES($1,$2,$3,$4,$5)",[otherMapping,organizations[0],instances[0],otherMember,other]);
 return {user,other,product,organizations,members,instances,mappings,otherMapping};
}
it.skipIf(!url)('verified identity deletion atomically creates service-provenance fenced denials without changing memberships',async()=>{
 const db=new Client({connectionString:url});await db.connect();await db.query('BEGIN');
 try {
  const f=await fixture(db);
  await db.query('SET LOCAL ROLE company_human_identity');
  await db.query("UPDATE users SET status='deleted',provider_event_timestamp=2 WHERE id=$1",[f.user]);
  await db.query('RESET ROLE');
  expect((await db.query('SELECT desired_enabled,desired_revision FROM product_memberships WHERE id=$1',[f.otherMapping])).rows[0]).toEqual({desired_enabled:true,desired_revision:1});
  const commands=await db.query("SELECT * FROM product_membership_commands WHERE source_user_id=$1 ORDER BY organization_id",[f.user]);
  expect(commands.rows).toHaveLength(2);
  for(const row of commands.rows)expect(row).toMatchObject({actor_user_id:null,actor_service_id:'identity-offboarding',source_user_id:f.user,source_event_timestamp:'2',operation:'suspendMember',desired_revision:2});
  expect((await db.query('SELECT desired_enabled,desired_revision,access_revision FROM product_memberships WHERE id=ANY($1)',[f.mappings])).rows).toEqual(Array(2).fill({desired_enabled:false,desired_revision:2,access_revision:'1'}));
  expect((await db.query('SELECT status,role_key FROM memberships WHERE id=ANY($1)',[f.members])).rows).toEqual(Array(2).fill({status:'active',role_key:'contributor'}));
  expect((await db.query('SELECT status FROM users WHERE id=$1',[f.other])).rows[0]?.status).toBe('active');
  expect((await db.query('SELECT count(*) FROM member_denial_jobs WHERE organization_id=ANY($1)',[f.organizations])).rows[0]?.count).toBe('2');
  const audits=await db.query("SELECT actor_type,actor_service_id,actor_user_id,envelope FROM identity_audit_events WHERE organization_id=ANY($1)",[f.organizations]);
  expect(audits.rows).toHaveLength(2);for(const a of audits.rows){expect(a.actor_type).toBe('service');expect(a.actor_user_id).toBeNull();expect(a.envelope.actor).toEqual({type:'service',id:'identity-offboarding'});}
  await db.query("UPDATE users SET status='deleted',provider_event_timestamp=3 WHERE id=$1",[f.user]);
  expect((await db.query('SELECT count(*) FROM product_membership_commands WHERE source_user_id=$1',[f.user])).rows[0]?.count).toBe('2');
  await db.query('SAVEPOINT reenable');await expect(db.query('UPDATE product_memberships SET desired_enabled=true WHERE id=$1',[f.mappings[0]])).rejects.toThrow('Product identity unavailable');await db.query('ROLLBACK TO reenable');
  for(const role of ['company_human_app','company_human_service','company_human_identity']) {
   expect((await db.query("SELECT has_function_privilege($1,'company_human_private.deny_deleted_identity_products()','EXECUTE') AS allowed",[role])).rows[0]?.allowed).toBe(false);
   await db.query('SAVEPOINT denial');await db.query(`SET LOCAL ROLE ${role}`);
   await expect(db.query("INSERT INTO product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_service_id,source_user_id,source_event_timestamp) VALUES($1,$2,$3,3,'suspendMember',$1,'identity-offboarding',$4,3)",[createCanonicalId('provisioningOperation'),f.organizations[0],f.mappings[0],f.user])).rejects.toThrow();
   await db.query('ROLLBACK TO denial');
  }
 } finally {await db.query('ROLLBACK');await db.end();}
});
it.skipIf(!url)('audit failure rolls back the identity tombstone, mappings and jobs',async()=>{
 const db=new Client({connectionString:url});await db.connect();await db.query('BEGIN');
 try {
  const f=await fixture(db);
  await db.query("CREATE FUNCTION pg_temp.fail_identity_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$");
  await db.query('CREATE TRIGGER test_fail_identity_audit BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_identity_audit()');
  await db.query('SAVEPOINT mutation');await db.query('SET LOCAL ROLE company_human_identity');
  await expect(db.query("UPDATE users SET status='deleted',provider_event_timestamp=2 WHERE id=$1",[f.user])).rejects.toThrow('test audit failure');
  await db.query('ROLLBACK TO mutation');
  expect((await db.query('SELECT status FROM users WHERE id=$1',[f.user])).rows[0]?.status).toBe('active');
  expect((await db.query('SELECT desired_enabled FROM product_memberships WHERE id=ANY($1)',[f.mappings])).rows.every(r=>r.desired_enabled)).toBe(true);
  expect((await db.query('SELECT count(*) FROM product_membership_commands WHERE source_user_id=$1',[f.user])).rows[0]?.count).toBe('0');
 }finally {await db.query('ROLLBACK');await db.end();}
});
it.skipIf(!url).each(['mapping-first','deletion-first'])('serializes concurrent product creation and identity deletion: %s',async order=>{
 const db=new Client({connectionString:url}),inserter=new Client({connectionString:url}),deleter=new Client({connectionString:url});
 await Promise.all([db.connect(),inserter.connect(),deleter.connect()]);
 let f: Awaited<ReturnType<typeof fixture>> | undefined;
 try {
  f=await fixture(db);await db.query('DELETE FROM product_memberships WHERE id=$1',[f.mappings[0]]);
  await inserter.query("BEGIN; SET LOCAL statement_timeout='5s'");await deleter.query("BEGIN; SET LOCAL statement_timeout='5s'; SET LOCAL ROLE company_human_identity");
  const insert=()=>inserter.query('INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,created_by_user_id) VALUES($1,$2,$3,$4,$5)',[f!.mappings[0],f!.organizations[0],f!.instances[0],f!.members[0],f!.other]);
  const remove=()=>deleter.query("UPDATE users SET status='deleted',provider_event_timestamp=2 WHERE id=$1",[f!.user]);
  const waitForLock=async(pid:number)=>{
   for(let attempt=0;attempt<100;attempt++) {
    const blocked=await db.query("SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",[pid]);
    if(blocked.rows[0]?.blocked)return;
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   throw new Error('Expected database lock was not observed');
  };
  if(order==='mapping-first') {
   await insert();const pid=(await deleter.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const waiting=remove();await waitForLock(pid);await inserter.query('COMMIT');await waiting;await deleter.query('COMMIT');
   expect((await db.query('SELECT desired_enabled FROM product_memberships WHERE id=$1',[f.mappings[0]])).rows[0]?.desired_enabled).toBe(false);
   expect((await db.query('SELECT count(*) FROM product_membership_commands WHERE source_user_id=$1',[f.user])).rows[0]?.count).toBe('2');
  } else {
   await remove();const pid=(await inserter.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   const waiting=insert().then(()=>null,error=>error as Error);await waitForLock(pid);await deleter.query('COMMIT');
   expect((await waiting)?.message).toContain('Product identity unavailable');await inserter.query('ROLLBACK');
   expect((await db.query('SELECT id FROM product_memberships WHERE id=$1',[f.mappings[0]])).rowCount).toBe(0);
  }
 } finally {
  await Promise.all([inserter.query('ROLLBACK'),deleter.query('ROLLBACK')]);
  if(f) {
   for(const table of ['identity_audit_events','member_denial_attempts','member_denial_jobs','member_access_commands','product_membership_commands','product_memberships','product_instances','memberships','role_permissions','roles']) await db.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[f.organizations]);
   await db.query('DELETE FROM organizations WHERE id=ANY($1)',[f.organizations]);await db.query('DELETE FROM products WHERE id=$1',[f.product]);await db.query('DELETE FROM users WHERE id=ANY($1)',[[f.user,f.other]]);
  }
  await Promise.all([db.end(),inserter.end(),deleter.end()]);
 }
});

it.skipIf(!url)('backfills pre-0049 tombstones without resurrection and replays without duplicate commands',async()=>{
 const db=new Client({connectionString:url});await db.connect();await db.query('BEGIN');
 try {
  const f=await fixture(db);
  // Reconstruct the historical database state before 0049 existed. No transition back to active.
  await db.query('ALTER TABLE users DISABLE TRIGGER identity_product_denial');
  await db.query("UPDATE users SET status='deleted',provider_event_timestamp=7 WHERE id=$1",[f.user]);
  await db.query('ALTER TABLE users ENABLE TRIGGER identity_product_denial');
  expect((await db.query('SELECT desired_enabled FROM product_memberships WHERE id=ANY($1)',[f.mappings])).rows.every(r=>r.desired_enabled)).toBe(true);
  const sql=await readFile(new URL('../migrations/0050_historical_identity_offboarding.sql',import.meta.url),'utf8');
  await db.query("CREATE FUNCTION pg_temp.fail_backfill_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test backfill audit failure'; END $$");
  await db.query('CREATE TRIGGER test_fail_backfill BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_backfill_audit()');
  await db.query('SAVEPOINT backfill');
  await expect(db.query(sql)).rejects.toThrow('test backfill audit failure');
  await db.query('ROLLBACK TO backfill');
  expect((await db.query('SELECT desired_enabled FROM product_memberships WHERE id=ANY($1)',[f.mappings])).rows.every(r=>r.desired_enabled)).toBe(true);
  expect((await db.query('SELECT count(*) FROM product_membership_commands WHERE source_user_id=$1',[f.user])).rows[0]?.count).toBe('0');
  await db.query('DROP TRIGGER test_fail_backfill ON identity_audit_events');
  await db.query(sql);
  expect((await db.query('SELECT status,provider_event_timestamp FROM users WHERE id=$1',[f.user])).rows[0]).toEqual({status:'deleted',provider_event_timestamp:'7'});
  const commands=await db.query('SELECT actor_user_id,actor_service_id,source_event_timestamp FROM product_membership_commands WHERE source_user_id=$1',[f.user]);
  expect(commands.rows).toEqual(Array(2).fill({actor_user_id:null,actor_service_id:'identity-offboarding',source_event_timestamp:'7'}));
  expect((await db.query('SELECT desired_enabled,access_revision FROM product_memberships WHERE id=ANY($1)',[f.mappings])).rows).toEqual(Array(2).fill({desired_enabled:false,access_revision:'1'}));
  expect((await db.query('SELECT desired_enabled FROM product_memberships WHERE id=$1',[f.otherMapping])).rows[0]?.desired_enabled).toBe(true);
  expect((await db.query('SELECT count(*) FROM member_denial_jobs WHERE organization_id=ANY($1)',[f.organizations])).rows[0]?.count).toBe('2');
  expect((await db.query("SELECT count(*) FROM identity_audit_events WHERE organization_id=ANY($1) AND after_state->>'reason'='historical_identity_tombstone'",[f.organizations])).rows[0]?.count).toBe('2');
  await db.query(sql);
  expect((await db.query('SELECT count(*) FROM product_membership_commands WHERE source_user_id=$1',[f.user])).rows[0]?.count).toBe('2');
 }finally {await db.query('ROLLBACK');await db.end();}
});
