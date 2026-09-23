import {randomBytes} from 'node:crypto';
import {Client} from 'pg';
import {expect,it} from 'vitest';
import {createCanonicalId} from '@company-human/contracts';
import {syncAuthUser} from './auth-users.js';
import {createOrganization} from './organizations.js';
import {requestProductMembership} from './product-memberships.js';
import {claimMemberBootstrap,finishMemberBootstrap} from './member-bootstrap-worker.js';
import {claimMemberDenial,finishMemberDenial} from './member-denial-worker.js';

const url=process.env.DATABASE_URL;
const suspended=(externalMemberId:string)=>({status:'succeeded' as const,value:{externalMemberId,status:'suspended' as const}});
it.skipIf(!url)('serializes catalog changes with suspended bindings and fences stale or legacy intents per tenant',async()=>{
 const db=new Client({connectionString:url});await db.connect();
 const observer=new Client({connectionString:url});await observer.connect();
 const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex');
 const serviceRole=`ch_cb_service_${suffix}`,bootstrapRole=`ch_cb_boot_${suffix}`,denialRole=`ch_cb_denial_${suffix}`;
 for(const [role,grant] of [[serviceRole,'company_human_service'],[bootstrapRole,'company_human_bootstrap_worker'],[denialRole,'company_human_member_worker']]){
  await db.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await db.query(`GRANT ${grant} TO ${role}`);
 }
 const endpoint=(role:string)=>{const value=new URL(url!);value.username=role;value.password=password;return value.toString();};
 const service=endpoint(serviceRole),bootstrap=endpoint(bootstrapRole),denial=endpoint(denialRole);
 const owner=await syncAuthUser(url!,{authIssuer:'https://catalog-binding.test',authSubject:suffix,primaryEmail:null,displayName:'Owner',status:'active',eventTimestamp:1});
 const colleague=await syncAuthUser(url!,{authIssuer:'https://catalog-binding.test',authSubject:`colleague-${suffix}`,primaryEmail:null,displayName:'Colleague',status:'active',eventTimestamp:1});
 const a=await createOrganization(url!,{ownerUserId:owner,slug:`catalog-bind-a-${suffix}`,name:'A'});
 const b=await createOrganization(url!,{ownerUserId:owner,slug:`catalog-bind-b-${suffix}`,name:'B'});
 const orgs=[a.organizationId,b.organizationId],product=createCanonicalId('product');
 const metadata={schemaVersion:1,category:'sales',description:'Fixture',supportedCapabilities:['read'],usageMeters:[],
  requiredPermissions:['product.use'],adapterVersion:'1.0.0',provisioningModes:['connected'],
  supportedMemberOperations:['suspend'],billingBehavior:'organization_sponsored',connectionRequirements:[],deepLinks:{}};
 const instances=[createCanonicalId('productInstance'),createCanonicalId('productInstance')];
 const members=[a.ownerMembershipId,b.ownerMembershipId];
 const extraMembers=[createCanonicalId('membership'),createCanonicalId('membership')];
 const mappings:string[]=[];
 const mappingState=async(id:string)=>(await db.query('SELECT desired_revision,access_revision,policy_blocked,external_member_id,provisioning_status FROM product_memberships WHERE id=$1',[id])).rows[0];
 const commandFor=async(id:string)=>(await db.query("SELECT * FROM product_membership_commands WHERE product_membership_id=$1 AND operation='provisionMember'",[id])).rows[0];
 const setup=async(orgIndex:number,memberId:string)=>{
  const id=await requestProductMembership(service,{actorUserId:owner,organizationId:orgs[orgIndex]!,productInstanceId:instances[orgIndex]!,membershipId:memberId});
  mappings.push(id);return id;
 };
 const claim=async(orgIndex:number)=>{
  const lease=await claimMemberBootstrap(bootstrap,orgs[orgIndex]!,product);
  if(!lease)throw new Error('Expected member bootstrap lease');return lease;
 };
 try{
  await db.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`catalog-bind-${suffix}`,metadata]);
  for(let index=0;index<2;index++){
   await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active',$2,$4)",
    [instances[index],orgs[index],product,owner]);
   await db.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')",[extraMembers[index],orgs[index],colleague]);
  }
  const staleA=await setup(0,members[0]!);const staleB=await setup(1,members[1]!);
  expect((await commandFor(staleA)).catalog_access_revision).toBe('0');
  const leaseA=await claim(0),leaseB=await claim(1);
  expect(await claimMemberBootstrap(bootstrap,orgs[0]!,createCanonicalId('product'))).toBeNull();
  await expect(finishMemberBootstrap(bootstrap,orgs[1]!,leaseA,suspended(staleA))).rejects.toThrow('Stale');
  // Two live connections: catalog owns the access lock while the provider
  // receipt waits to bind. Its commit is then observed by the binder.
  await db.query('BEGIN');
  await db.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,{...metadata,supportedCapabilities:['write']}]);
  const pendingBind=finishMemberBootstrap(bootstrap,orgs[0]!,leaseA,suspended(staleA));
  let observedCatalogLock=false;
  let activity:unknown[]=[];
  for(let attempt=0;attempt<40;attempt++){
   const waiting=await observer.query<{query:string;wait_event_type:string|null;wait_event:string|null}>(`SELECT query,wait_event_type,wait_event FROM pg_stat_activity
    WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active'`);
   activity=waiting.rows;
   if(waiting.rows.some(row=>row.wait_event_type==='Lock'&&row.wait_event==='advisory'
    && row.query.includes('bind_suspended_product_member'))){observedCatalogLock=true;break;}
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  await db.query('COMMIT');
  await pendingBind;
  expect({observedCatalogLock,activity}).toMatchObject({observedCatalogLock:true});
  expect((await db.query('SELECT access_contract_revision FROM products WHERE id=$1',[product])).rows[0].access_contract_revision).toBe('1');
  expect(await mappingState(staleA)).toMatchObject({desired_revision:2,access_revision:'1',policy_blocked:true,external_member_id:staleA,provisioning_status:'suspended'});
  const staleCommand=(await db.query("SELECT * FROM product_membership_commands WHERE product_membership_id=$1 AND source_catalog IS NOT NULL",[staleA])).rows[0];
  expect(staleCommand.source_catalog).toMatchObject({kind:'product_catalog',productId:product,reason:'stale_provision_catalog_revision',provisionRevision:0,currentRevision:1});
  expect((await mappingState(staleB)).access_revision).toBe('0');
  await finishMemberBootstrap(bootstrap,orgs[1]!,leaseB,suspended(staleB));
  expect((await mappingState(staleB)).policy_blocked).toBe(true);
  const denialA=(await claimMemberDenial(denial,orgs[0]!,product,true))!;
  expect(denialA.accessCommand?.accessRevision).toBe(1);
  await finishMemberDenial(denial,orgs[0]!,denialA,suspended(staleA));
  expect((await db.query('SELECT failure_code FROM member_denial_jobs WHERE command_id=$1',[denialA.commandId])).rows[0].failure_code).toBe('fenced_policy_receipt_required');
  const denialB=(await claimMemberDenial(denial,orgs[1]!,product,true))!;
  await finishMemberDenial(denial,orgs[1]!,denialB,suspended(staleB),denialB.accessCommand);
  expect((await db.query('SELECT status FROM member_denial_jobs WHERE command_id=$1',[denialB.commandId])).rows[0].status).toBe('succeeded');

  // Binding commits first. The catalog trigger observes that provider binding and journals its denial.
  const boundBefore=await setup(1,extraMembers[1]!);
  expect((await commandFor(boundBefore)).catalog_access_revision).toBe('1');
  const firstLease=await claim(1);await finishMemberBootstrap(bootstrap,orgs[1]!,firstLease,suspended(boundBefore));
  expect(await mappingState(boundBefore)).toMatchObject({desired_revision:1,access_revision:'0',policy_blocked:false,external_member_id:boundBefore});
  await db.query('UPDATE products SET catalog_metadata=$2 WHERE id=$1',[product,{...metadata,supportedCapabilities:['write'],requiredPermissions:['product.use','billing.read.all']}]);
  expect(await mappingState(boundBefore)).toMatchObject({desired_revision:2,access_revision:'1',policy_blocked:true});
  expect((await db.query("SELECT source_catalog->>'reason' reason FROM product_membership_commands WHERE product_membership_id=$1 AND source_catalog IS NOT NULL",[boundBefore])).rows[0].reason).toBeNull();

  // A provision command from before this migration has no stamp. Its successful
  // suspended receipt remains bound and immediately enters the same denial journal.
  const legacy=await setup(0,extraMembers[0]!);
  await db.query('UPDATE product_membership_commands SET catalog_access_revision=NULL WHERE product_membership_id=$1 AND operation=$2',[legacy,'provisionMember']);
  const legacyLease=await claim(0);
  const guard=`catalog_bind_audit_${suffix}`;
  await db.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${legacy}' AND NEW.action='product.catalog.access_blocked' THEN RAISE EXCEPTION 'catalog binding audit failure'; END IF; RETURN NEW; END $$`);
  await db.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
  try{
   await expect(finishMemberBootstrap(bootstrap,orgs[0]!,legacyLease,suspended(legacy))).rejects.toThrow('catalog binding audit failure');
   expect((await mappingState(legacy)).external_member_id).toBeNull();
   expect((await db.query('SELECT status FROM member_bootstrap_jobs WHERE command_id=$1',[legacyLease.commandId])).rows[0].status).toBe('running');
  }finally{await db.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await db.query(`DROP FUNCTION public.${guard}()`);}
  await finishMemberBootstrap(bootstrap,orgs[0]!,legacyLease,suspended(legacy));
  expect(await mappingState(legacy)).toMatchObject({desired_revision:2,access_revision:'1',policy_blocked:true,external_member_id:legacy,provisioning_status:'suspended'});
  expect((await db.query("SELECT source_catalog->>'reason' reason FROM product_membership_commands WHERE product_membership_id=$1 AND source_catalog IS NOT NULL",[legacy])).rows[0].reason).toBe('stale_provision_catalog_revision');
  const draftInstance=createCanonicalId('productInstance');
  await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'draft-case','connected','active',$2,$4)",
   [draftInstance,orgs[0],product,owner]);
  const draftMapping=await requestProductMembership(service,{actorUserId:owner,organizationId:orgs[0]!,productInstanceId:draftInstance,membershipId:members[0]!});
  const draftLease=await claim(0);
  await db.query("UPDATE products SET catalog_status='draft' WHERE id=$1",[product]);
  await finishMemberBootstrap(bootstrap,orgs[0]!,draftLease,suspended(draftMapping));
  expect((await mappingState(draftMapping)).external_member_id).toBeNull();
  expect((await db.query('SELECT status,failure_code FROM member_bootstrap_jobs WHERE command_id=$1',[draftLease.commandId])).rows[0]).toEqual({status:'superseded',failure_code:'superseded_revision'});
  for(const role of ['company_human_service','company_human_member_binding','company_human_policy_denial'])
   expect((await db.query("SELECT has_table_privilege($1,'public.products','UPDATE') allowed",[role])).rows[0].allowed).toBe(false);
  for(const role of ['company_human_service','company_human_bootstrap_worker','company_human_member_worker'])
   expect((await db.query("SELECT has_function_privilege($1,'company_human_private.block_stale_catalog_binding(text,text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }finally{
  for(const table of ['identity_audit_events','member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','member_bootstrap_attempts','member_bootstrap_jobs','product_membership_commands','product_memberships','product_instances','memberships','role_permissions','roles'])
   await db.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
  await db.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await db.query('DELETE FROM products WHERE id=$1',[product]);await db.query('DELETE FROM users WHERE id=ANY($1)',[[owner,colleague]]);
  for(const role of [serviceRole,bootstrapRole,denialRole])await db.query(`DROP ROLE ${role}`);
  await observer.end();await db.end();
 }
},60000);
