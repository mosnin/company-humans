import {randomBytes} from 'node:crypto';
import {Client} from 'pg';
import {expect,it} from 'vitest';
import {createCanonicalId} from '@company-human/contracts';
import {syncAuthUser} from './auth-users.js';
import {createOrganization} from './organizations.js';
import {claimMemberDenial,finishMemberDenial} from './member-denial-worker.js';
const url=process.env.DATABASE_URL;
it.skipIf(!url)('organization suspension creates fenced denial, rolls back with audit, and reconciles historical bindings once',async()=>{
 const db=new Client({connectionString:url});await db.connect();
 const suffix=randomBytes(6).toString('hex'),password=randomBytes(20).toString('hex'),workerRole=`ch_org_denial_${suffix}`;
 await db.query(`CREATE ROLE ${workerRole} LOGIN PASSWORD '${password}'`);await db.query(`GRANT company_human_member_worker TO ${workerRole}`);
 const worker=new URL(url!);worker.username=workerRole;worker.password=password;
 const user=await syncAuthUser(url!,{authIssuer:'https://organization-denial.test',authSubject:suffix,primaryEmail:null,displayName:'Organization fixture',status:'active',eventTimestamp:1});
 const second=await syncAuthUser(url!,{authIssuer:'https://organization-denial.test',authSubject:`second-${suffix}`,primaryEmail:null,displayName:'Other fixture',status:'active',eventTimestamp:1});
 const a=await createOrganization(url!,{ownerUserId:user,slug:`org-denial-a-${suffix}`,name:'A'});
 const b=await createOrganization(url!,{ownerUserId:user,slug:`org-denial-b-${suffix}`,name:'B'});
 const orgs=[a.organizationId,b.organizationId],product=createCanonicalId('product');
 const metadata={schemaVersion:1,description:'Fixture only',category:'sales',supportedCapabilities:[],provisioningModes:['connected'],supportedMemberOperations:['suspend'],usageMeters:[],requiredPermissions:['product.use'],adapterVersion:'1.0.0',billingBehavior:'organization_sponsored',deepLinks:{},connectionRequirements:[]};
 const instanceA=createCanonicalId('productInstance'),instanceB=createCanonicalId('productInstance');
 const mappingA=createCanonicalId('productMembership'),mappingB=createCanonicalId('productMembership'),historical=createCanonicalId('productMembership');
 const secondMember=createCanonicalId('membership');
 const state=async(id:string)=>(await db.query('SELECT desired_enabled,desired_revision,access_revision,policy_blocked,provisioning_status FROM product_memberships WHERE id=$1',[id])).rows[0];
 const setFixtureStatus=async(org:string,status:string)=>{await db.query('BEGIN');try{
  await db.query('ALTER TABLE organizations DISABLE TRIGGER service_update_guard');
  await db.query('UPDATE organizations SET status=$2 WHERE id=$1',[org,status]);
  await db.query('ALTER TABLE organizations ENABLE TRIGGER service_update_guard');await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}};
 try{
  await db.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Fixture','ready',$3)",[product,`org-denial-${suffix}`,metadata]);
  for(const [org,instance,mapping,member] of [[a.organizationId,instanceA,mappingA,a.ownerMembershipId],[b.organizationId,instanceB,mappingB,b.ownerMembershipId]]){
   await db.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,provisioning_status,external_organization_id,created_by_user_id) VALUES($1,$2,$3,'primary','connected','active',$2,$4)",[instance,org,product,user]);
   await db.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,external_member_id,created_by_user_id) VALUES($1,$2,$3,$4,'suspended',$1,$5)",[mapping,org,instance,member,user]);
  }
  await setFixtureStatus(a.organizationId,'suspended');
  expect(await state(mappingA)).toEqual({desired_enabled:true,desired_revision:2,access_revision:'1',policy_blocked:true,provisioning_status:'suspended'});
  expect(await state(mappingB)).toEqual({desired_enabled:true,desired_revision:1,access_revision:'0',policy_blocked:false,provisioning_status:'suspended'});
  const command=(await db.query('SELECT * FROM product_membership_commands WHERE product_membership_id=$1',[mappingA])).rows[0];
  expect(command).toMatchObject({actor_user_id:null,actor_service_id:'organization-access',source_workspace:{kind:'organization_status',organizationId:a.organizationId,status:'suspended',historical:false}});
  expect((await db.query('SELECT count(*)::int n FROM member_denial_jobs WHERE command_id=$1',[command.id])).rows[0].n).toBe(1);
  const lease=(await claimMemberDenial(worker.toString(),a.organizationId,product,true))!;
  expect(lease.accessCommand?.accessRevision).toBe(1);
  await finishMemberDenial(worker.toString(),a.organizationId,lease,
    {status:'succeeded',value:{externalMemberId:mappingA,status:'suspended'}});
  expect((await db.query('SELECT status,failure_code FROM member_denial_jobs WHERE command_id=$1',[command.id])).rows[0]).toEqual({status:'failed',failure_code:'fenced_policy_receipt_required'});
  await setFixtureStatus(a.organizationId,'active');
  expect((await state(mappingA)).policy_blocked).toBe(true);
  const guard=`org_denial_audit_${suffix}`;
  await db.query(`CREATE FUNCTION public.${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id='${mappingB}' AND NEW.action='organization.access_blocked' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`);
  await db.query(`CREATE TRIGGER ${guard} BEFORE INSERT ON identity_audit_events FOR EACH ROW EXECUTE FUNCTION public.${guard}()`);
  try{await expect(setFixtureStatus(b.organizationId,'suspended')).rejects.toThrow('fixture audit failure');}
  finally{await db.query(`DROP TRIGGER ${guard} ON identity_audit_events`);await db.query(`DROP FUNCTION public.${guard}()`);}
  expect((await db.query('SELECT status FROM organizations WHERE id=$1',[b.organizationId])).rows[0].status).toBe('active');
  expect((await state(mappingB)).policy_blocked).toBe(false);
  await setFixtureStatus(b.organizationId,'suspended');
  await db.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key) VALUES($1,$2,$3,'active','contributor')",[secondMember,b.organizationId,second]);
  await db.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,provisioning_status,external_member_id,created_by_user_id) VALUES($1,$2,$3,$4,'suspended',$1,$5)",[historical,b.organizationId,instanceB,secondMember,user]);
  const reconcile=async()=>{await db.query('BEGIN');try{await db.query('SET LOCAL ROLE company_human_policy_denial');const result=await db.query<{n:number}>(
   'SELECT company_human_private.block_inactive_organization_members($1,$2,true) n',[b.organizationId,'preexisting']);await db.query('COMMIT');return result.rows[0]!.n;}
   catch(error){await db.query('ROLLBACK');throw error;}};
  expect(await reconcile()).toBe(1);expect(await reconcile()).toBe(0);
  expect((await state(historical)).policy_blocked).toBe(true);
  expect((await state(mappingB)).access_revision).toBe('1');
  for(const role of ['company_human_service','company_human_app','company_human_member_worker'])
   expect((await db.query("SELECT has_function_privilege($1,'company_human_private.block_inactive_organization_members(text,text,boolean)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }finally{
  for(const table of ['identity_audit_events','member_denial_access_receipts','member_denial_attempts','member_denial_jobs','member_access_commands','product_membership_commands','product_memberships','product_instances','memberships','role_permissions','roles'])
   await db.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[orgs]);
  await db.query('DELETE FROM organizations WHERE id=ANY($1)',[orgs]);await db.query('DELETE FROM products WHERE id=$1',[product]);await db.query('DELETE FROM users WHERE id=ANY($1)',[[user,second]]);
  await db.query(`DROP ROLE ${workerRole}`);await db.end();
 }
},30000);
