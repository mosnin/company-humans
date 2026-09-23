import {randomBytes} from 'node:crypto';
import {Client} from 'pg';
import {expect,it} from 'vitest';
import {createCanonicalId} from '@company-human/contracts';
import {syncAuthUser} from './auth-users.js';
import {createOrganization} from './organizations.js';
import {claimMemberDenial,finishMemberDenial} from './member-denial-worker.js';
const url=process.env.DATABASE_URL;
it.skipIf(!url)('catalog access changes deny bound members in every tenant and preserve unrelated changes',async()=>{
 const db=new Client({connectionString:url});await db.connect();
 const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex'),workerRole=`ch_catalog_worker_${suffix}`;
 await db.query(`CREATE ROLE ${workerRole} LOGIN PASSWORD '${password}'`);await db.query(`GRANT company_human_member_worker TO ${workerRole}`);
 const worker=new URL(url!);worker.username=workerRole;worker.password=password;
 const user=await syncAuthUser(url!,{authIssuer:'https://catalog-denial.test',authSubject:suffix,primaryEmail:null,displayName:'Catalog fixture',status:'active',eventTimestamp:1});
 const second=await syncAuthUser(url!,{authIssuer:'https://catalog-denial.test',authSubject:`second-${suffix}`,primaryEmail:null,displayName:'Catalog member',status:'active',eventTimestamp:1});
 const a=await createOrganization(url!,{ownerUserId:user,slug:`catalog-a-${suffix}`,name:'A'});
 const b=await createOrganization(url!,{ownerUserId:user,slug:`catalog-b-${suffix}`,name:'B'});
 const orgs=[a.organizationId,b.organizationId],product=createCanonicalId('product'),unrelated=createCanonicalId('product');
 const metadata={schemaVersion:1,description:'Fixture only',category:'sales',supportedCapabilities:['read'],provisioningModes:['connected'],supportedMemberOperations:['suspend'],usageMeters:[],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:[]};
 const instanceA=createCanonicalId('productInstance'),instanceB=createCanonicalId('productInstance'),otherInstance=createCanonicalId('productInstance');
 const mappingA=createCanonicalId('productMembership'),mappingB=createCanonicalId('productMembership'),otherMapping=createCanonicalId('productMembership'),pending=createCanonicalId('productMembership'),historical=createCanonicalId('productMembership');
 const secondMemberA=createCanonicalId('membership'),secondMemberB=createCanonicalId('membership');
 const state=async(id:string)=>(await db.query('SELECT desired_revision,access_revision,policy_blocked,desired_enabled FROM product_memberships WHERE id=$1',[id])).rows[0];
 try{
  for(const [id,key] of [[product,`catalog-${suffix}`],[unrelated,`other-${suffix}`]])
   await db.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[id,key,metadata]);
  for(const [org,instance,productId,mapping,member] of [[a.organizationId,instanceA,product,mappingA,a.ownerMembershipId],
   [b.organizationId,instanceB,product,mappingB,b.ownerMembershipId],[a.organizationId,otherInstance,unrelated,otherMapping,a.ownerMembershipId]]){
   await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active',$2,$4)",[instance,org,productId,user]);
   await db.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,external_member_id,created_by_user_id) VALUES($1,$2,$3,$4,'suspended',$1,$5)",[mapping,org,instance,member,user]);
  }
  await db.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')",[secondMemberA,a.organizationId,second]);
  await db.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,created_by_user_id) VALUES($1,$2,$3,$4,'pending',$5)",[pending,a.organizationId,instanceA,secondMemberA,user]);
  await db.query('UPDATE products SET display_name=$2,catalog_metadata=$3 WHERE id=$1',[product,'New display',{...metadata,description:'A new description'}]);
  expect(await state(mappingA)).toEqual({desired_revision:1,access_revision:'0',policy_blocked:false,desired_enabled:true});
  const changed={...metadata,description:'A new description',supportedCapabilities:['write']};
  await db.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,changed]);
  for(const id of [mappingA,mappingB])expect(await state(id)).toEqual({desired_revision:2,access_revision:'1',policy_blocked:true,desired_enabled:true});
  for(const id of [otherMapping,pending])expect((await state(id)).access_revision).toBe('0');
  const command=(await db.query('SELECT * FROM product_membership_commands WHERE product_membership_id=$1',[mappingA])).rows[0];
  expect(command.source_catalog).toMatchObject({kind:'product_catalog',productId:product,historical:false,beforeAccess:{supportedCapabilities:['read']},afterAccess:{supportedCapabilities:['write']}});
  await expect(db.query("INSERT INTO product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_service_id,source_catalog) VALUES($1,$2,$3,999,'suspendMember',$1,'catalog-invalidation',$4)",
   [`malformed-${suffix}`,a.organizationId,mappingA,{kind:'product_catalog',productId:product}])).rejects.toThrow();
  const lease=(await claimMemberDenial(worker.toString(),a.organizationId,product,true))!;
  await finishMemberDenial(worker.toString(),a.organizationId,lease,{status:'succeeded',value:{externalMemberId:mappingA,status:'suspended'}});
  expect((await db.query('SELECT failure_code FROM member_denial_jobs WHERE command_id=$1',[command.id])).rows[0].failure_code).toBe('fenced_policy_receipt_required');
  const guard=`catalog_audit_failure_${suffix}`;
  await db.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${mappingB}' AND NEW.action='product.catalog.access_blocked' THEN RAISE EXCEPTION 'fixture catalog audit failure'; END IF; RETURN NEW; END $$`);
  await db.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
  try{await expect(db.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,{...changed,requiredPermissions:['product.use','billing.read.all']}])).rejects.toThrow('fixture catalog audit failure');}
  finally{await db.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await db.query(`DROP FUNCTION public.${guard}()`);}
  expect((await state(mappingA)).access_revision).toBe('1');
  expect((await db.query('SELECT catalog_metadata FROM products WHERE id=$1',[product])).rows[0].catalog_metadata.requiredPermissions).toEqual(['product.use']);
  await db.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,{...changed,requiredPermissions:['product.use','billing.read.all']}]);
  for(const id of [mappingA,mappingB])expect((await state(id)).access_revision).toBe('2');
  expect((await db.query('SELECT catalog_metadata FROM products WHERE id=$1',[product])).rows[0].catalog_metadata.requiredPermissions).toEqual(['product.use','billing.read.all']);
  await db.query("UPDATE products SET catalog_status='retired' WHERE id=$1",[product]);
  for(const id of [mappingA,mappingB])expect((await state(id)).access_revision).toBe('3');
  let current=await claimMemberDenial(worker.toString(),a.organizationId,product,true);
  for(let attempt=0;attempt<4&&!current;attempt++)current=await claimMemberDenial(worker.toString(),a.organizationId,product,true);
  expect(current).not.toBeNull();
  if(!current)throw new Error('Current catalog denial lease missing');
  expect(current.accessCommand?.accessRevision).toBe(3);
  await finishMemberDenial(worker.toString(),a.organizationId,current,{status:'succeeded',value:{externalMemberId:mappingA,status:'suspended'}},current.accessCommand);
  expect((await db.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[current.commandId])).rows[0].status).toBe('succeeded');
  expect((await db.query('SELECT provisioning_status FROM product_memberships WHERE id=$1',[mappingA])).rows[0].provisioning_status).toBe('suspended');
  expect((await state(otherMapping)).access_revision).toBe('0');
  expect((await state(pending)).desired_revision).toBe(1);
  await db.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')",[secondMemberB,b.organizationId,second]);
  await db.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,external_member_id,created_by_user_id) VALUES($1,$2,$3,$4,'suspended',$1,$5)",[historical,b.organizationId,instanceB,secondMemberB,user]);
  const reconcile=async()=>{await db.query('BEGIN');try{await db.query('SET LOCAL ROLE company_human_policy_denial');const result=await db.query<{n:number}>(
   'SELECT company_human_private.block_catalog_members($1,$2::jsonb,true) n',[product,JSON.stringify({status:'retired',reason:'fixture'})]);await db.query('COMMIT');return result.rows[0]!.n;}
   catch(error){await db.query('ROLLBACK');throw error;}};
  expect(await reconcile()).toBe(1);expect(await reconcile()).toBe(0);
  expect((await state(historical)).policy_blocked).toBe(true);
  for(const role of ['company_human_service','company_human_app','company_human_member_worker'])
   expect((await db.query("SELECT has_function_privilege($1,'company_human_private.block_catalog_members(text,jsonb,boolean)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  for(const role of ['company_human_service','company_human_app','company_human_member_worker'])
   expect((await db.query("SELECT has_table_privilege($1,'public.products','UPDATE') allowed",[role])).rows[0].allowed).toBe(false);
 }finally{
  for(const table of ['identity_audit_events','member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','product_membership_commands','product_memberships','product_instances','memberships','role_permissions','roles'])
   await db.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
  await db.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await db.query('DELETE FROM products WHERE id=ANY($1)',[[product,unrelated]]);await db.query('DELETE FROM users WHERE id=ANY($1)',[[user,second]]);
  await db.query(`DROP ROLE ${workerRole}`);await db.end();
 }
},30000);
