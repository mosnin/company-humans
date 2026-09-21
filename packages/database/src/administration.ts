import { OrganizationIdSchema, ProductInstanceIdSchema, UserIdSchema, MembershipIdSchema, ProductCatalogMetadataV1Schema, EntitlementEffectSchema, requestedEntitlementEffect, LimitQuantitySchema, LimitWindowSchema, type Capability } from "@company-human/contracts";
import { Client } from "pg";
import { setServiceContext } from "./service-context.js";

export class AdministrationDenied extends Error {
  constructor() { super("Organization administration denied"); }
}

async function readAdministration<T>(databaseUrl: string, actorUserId: string, organizationId: string, capabilities: Capability[], read: (client: Client) => Promise<T>): Promise<T> {
  UserIdSchema.parse(actorUserId); OrganizationIdSchema.parse(organizationId);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await setServiceContext(client, actorUserId, organizationId);
    const permitted = await client.query("SELECT 1 FROM unnest($2::text[]) capability WHERE company_human_private.has_capability($1,capability) LIMIT 1", [organizationId, capabilities]);
    if (!permitted.rowCount) throw new AdministrationDenied();
    const result = await read(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}

export interface PersonSummary { id: string; userId: string; name: string; email: string | null; roleKey: string; status: string }
export async function listPeople(databaseUrl: string, actorUserId: string, organizationId: string, search = "", page = 1) {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  const query = search.trim().slice(0, 128);
  return readAdministration(databaseUrl, actorUserId, organizationId, ["members.manage"], async client => {
    const filter = `FROM public.memberships m JOIN public.users u ON u.id = m.user_id
      WHERE m.organization_id = $1 AND (u.display_name ILIKE $2 OR u.primary_email ILIKE $2)`;
    const values = [organizationId, `%${query}%`];
    const count = await client.query<{ total: string }>(`SELECT count(*) AS total ${filter}`, values);
    const rows = await client.query<PersonSummary>(`SELECT m.id, m.user_id AS "userId", u.display_name AS name,
      u.primary_email AS email, m.role_key AS "roleKey", m.status ${filter} ORDER BY u.display_name, m.id LIMIT 50 OFFSET $3`, [...values, (currentPage - 1) * 50]);
    return { people: rows.rows, total: Number(count.rows[0]!.total), page: currentPage };
  });
}

export interface TeamSummary { id: string; name: string; memberCount: number; members: { name: string; role: string }[] }
export async function listTeams(databaseUrl: string, actorUserId: string, organizationId: string) {
  return readAdministration(databaseUrl, actorUserId, organizationId, ["teams.create", "teams.manage.all"], async client => {
    const teams = await client.query<TeamSummary>(`SELECT t.id,t.name,count(m.id)::integer AS "memberCount",
      COALESCE(jsonb_agg(jsonb_build_object('name',u.display_name,'role',tm.team_role) ORDER BY u.display_name) FILTER (WHERE m.id IS NOT NULL),'[]') AS members
      FROM public.teams t LEFT JOIN public.team_memberships tm ON tm.team_id = t.id AND tm.organization_id = t.organization_id AND tm.ended_at IS NULL
      LEFT JOIN public.memberships m ON m.id = tm.membership_id AND m.organization_id = t.organization_id AND m.status = 'active'
      LEFT JOIN public.users u ON u.id = m.user_id
      WHERE t.organization_id = $1 AND t.status = 'active' GROUP BY t.id ORDER BY t.name LIMIT 200`, [organizationId]);
    return teams.rows;
  });
}
export interface RolePolicy { id: string; key: string; capabilities: Capability[] }
export async function listRolePolicies(databaseUrl: string, actorUserId: string, organizationId: string) {
  return readAdministration(databaseUrl, actorUserId, organizationId, ["roles.manage"], async client => {
    return (await client.query<RolePolicy>(`SELECT r.id,r.key,
      COALESCE(array_agg(p.permission_key ORDER BY p.permission_key) FILTER (WHERE p.permission_key IS NOT NULL),'{}') AS capabilities
      FROM public.roles r LEFT JOIN public.role_permissions p ON p.role_id = r.id AND p.organization_id = r.organization_id
      WHERE r.organization_id = $1 GROUP BY r.id ORDER BY r.key`, [organizationId])).rows;
  });
}

export interface AuditSummary {
  id: string; action: string; actorName: string; actorUserId: string | null; actorServiceId: string | null; actorType: "human" | "service"; targetType: string; targetId: string;
  occurredAt: Date; beforeState: Record<string,unknown> | null; afterState: Record<string,unknown> | null;
}
export async function listAuditEvents(databaseUrl: string, actorUserId: string, organizationId: string, page = 1) {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  return readAdministration(databaseUrl, actorUserId, organizationId, ["audit.read.all"], async client => {
    const count = await client.query<{ total: string }>("SELECT count(*) AS total FROM public.identity_audit_events WHERE organization_id = $1", [organizationId]);
    const events = await client.query<AuditSummary>(`SELECT a.id,a.action,CASE WHEN a.actor_type='service' THEN CASE WHEN a.actor_service_id='member-denial-worker' THEN 'Member lifecycle worker' ELSE a.actor_service_id END ELSE COALESCE(u.display_name,'Unknown actor') END AS "actorName",
      a.actor_type AS "actorType",a.actor_service_id AS "actorServiceId",
      a.actor_user_id AS "actorUserId",a.target_type AS "targetType",a.target_id AS "targetId",a.occurred_at AS "occurredAt",
      a.before_state AS "beforeState",a.after_state AS "afterState"
      FROM public.identity_audit_events a LEFT JOIN public.users u ON u.id = a.actor_user_id
      WHERE a.organization_id = $1 ORDER BY a.occurred_at DESC,a.id DESC LIMIT 50 OFFSET $2`, [organizationId,(currentPage-1)*50]);
    return { events: events.rows,total:Number(count.rows[0]!.total),page:currentPage };
  });
}

export interface ApplicationDiagnostic {
  id: string; productName: string; instanceKey: string; mode: string; desiredEnabled: boolean; provisioningStatus: string;
  operation: null | { status: string; attemptCount: number; failureCode: string | null; nextAttemptAt: string;
    attempts: { number: number; startedAt: string; finishedAt: string | null; outcome: string | null; failureCode: string | null }[] };
}
/** Explicit projection excludes lease credentials, provider references and raw payloads. */
export async function listApplicationDiagnostics(databaseUrl: string, actorUserId: string, organizationId: string, page = 1) {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  return readAdministration(databaseUrl, actorUserId, organizationId, ["applications.manage"], async client => {
    const count = await client.query<{ total: string }>("SELECT count(*) AS total FROM public.product_instances WHERE organization_id = $1", [organizationId]);
    const records = await client.query<ApplicationDiagnostic>(`SELECT i.id,p.display_name AS "productName",i.instance_key AS "instanceKey",
      i.mode,i.desired_enabled AS "desiredEnabled",i.provisioning_status AS "provisioningStatus",
      CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('status',o.status,'attemptCount',o.attempt_count,
        'failureCode',o.failure_code,'nextAttemptAt',o.next_attempt_at,'attempts',COALESCE((
          SELECT jsonb_agg(jsonb_build_object('number',a.attempt_number,'startedAt',a.started_at,'finishedAt',a.finished_at,
            'outcome',a.outcome,'failureCode',a.failure_code) ORDER BY a.attempt_number)
          FROM public.provisioning_attempts a WHERE a.organization_id = i.organization_id AND a.operation_id = o.id),'[]'::jsonb)) END AS operation
      FROM public.product_instances i JOIN public.products p ON p.id = i.product_id
      LEFT JOIN public.provisioning_operations o ON o.organization_id = i.organization_id AND o.product_instance_id = i.id
      WHERE i.organization_id = $1 ORDER BY p.display_name,i.instance_key,i.id LIMIT 50 OFFSET $2`, [organizationId, (currentPage - 1) * 50]);
    return { applications: records.rows, total: Number(count.rows[0]!.total), page: currentPage };
  });
}

export interface InvitationSummary { id: string; email: string; roleKey: string; status: string; expiresAt: string }
/** Never expose invitation hashes or recover bearer links from persisted records. */
export async function listInvitations(databaseUrl: string, actorUserId: string, organizationId: string, page = 1) {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  return readAdministration(databaseUrl, actorUserId, organizationId, ["members.manage"], async client => {
    const count = await client.query<{ total: string }>("SELECT count(*) AS total FROM public.membership_invitations WHERE organization_id = $1", [organizationId]);
    const records = await client.query<InvitationSummary>(`SELECT id,recipient_email AS email,role_key AS "roleKey",
      CASE WHEN status = 'pending' AND expires_at <= now() THEN 'expired' ELSE status END AS status,
      expires_at::text AS "expiresAt" FROM public.membership_invitations WHERE organization_id = $1
      ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $2`, [organizationId,(currentPage-1)*50]);
    return { invitations: records.rows, total: Number(count.rows[0]!.total), page: currentPage };
  });
}

export interface ApplicationMemberDiagnostic {
  id: string; membershipId: string; memberName: string; membershipStatus: string; desiredEnabled: boolean;
  denial: null | { operation: string; status: string; attemptCount: number; failureCode: string | null;
    attempts: { number: number; startedAt: string; finishedAt: string | null; outcome: string | null; failureCode: string | null }[] };
}
/** Current-revision denial progress only; no lease, provider identity or raw payload leaves this query. */
export async function listApplicationMemberDiagnostics(databaseUrl: string, actorUserId: string, organizationId: string, instanceId: string, page = 1) {
  ProductInstanceIdSchema.parse(instanceId);
  const currentPage=Number.isSafeInteger(page)&&page>0?Math.min(page,100000):1;
  return readAdministration(databaseUrl,actorUserId,organizationId,["applications.manage"],async client=>{
    const instance=await client.query<{productName:string}>(`SELECT p.display_name AS "productName" FROM public.product_instances i
      JOIN public.products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.id=$2`,[organizationId,instanceId]);
    if(!instance.rows[0]) throw new AdministrationDenied();
    const count=await client.query<{total:string}>("SELECT count(*) AS total FROM public.product_memberships WHERE organization_id=$1 AND product_instance_id=$2",[organizationId,instanceId]);
    const records=await client.query<ApplicationMemberDiagnostic>(`SELECT pm.id,pm.membership_id AS "membershipId",COALESCE(u.display_name,'Member') AS "memberName",
      m.status AS "membershipStatus",pm.desired_enabled AS "desiredEnabled",
      CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('operation',c.operation,'status',COALESCE(j.status,'queued'),
        'attemptCount',COALESCE(j.attempt_count,0),'failureCode',j.failure_code,'attempts',COALESCE((SELECT jsonb_agg(
          jsonb_build_object('number',a.attempt_number,'startedAt',a.started_at,'finishedAt',a.finished_at,'outcome',a.outcome,'failureCode',a.failure_code)
          ORDER BY a.attempt_number) FROM public.member_denial_attempts a WHERE a.organization_id=pm.organization_id AND a.command_id=c.id),'[]'::jsonb)) END AS denial
      FROM public.product_memberships pm JOIN public.memberships m ON m.id=pm.membership_id AND m.organization_id=pm.organization_id
      LEFT JOIN public.users u ON u.id=m.user_id
      LEFT JOIN public.product_membership_commands c ON c.organization_id=pm.organization_id AND c.product_membership_id=pm.id
        AND c.desired_revision=pm.desired_revision AND c.operation IN ('suspendMember','removeMember')
      LEFT JOIN public.member_denial_jobs j ON j.organization_id=c.organization_id AND j.command_id=c.id
      WHERE pm.organization_id=$1 AND pm.product_instance_id=$2 ORDER BY pm.created_at,pm.id LIMIT 50 OFFSET $3`,[organizationId,instanceId,(currentPage-1)*50]);
    return {productName:instance.rows[0].productName,members:records.rows,total:Number(count.rows[0]!.total),page:currentPage};
  });
}

/** Desired policy settings only. Never use this projection to authorize product activity. */
export async function readApplicationEntitlements(databaseUrl: string, actorUserId: string, organizationId: string, instanceId: string, membershipId: string | null = null) {
  ProductInstanceIdSchema.parse(instanceId);
  if (membershipId !== null) MembershipIdSchema.parse(membershipId);
  return readAdministration(databaseUrl, actorUserId, organizationId, ["applications.manage"], async client => {
    const instance = await client.query<{ productName: string; catalog_status: string; catalog_metadata: unknown }>(
      `SELECT p.display_name AS "productName", p.catalog_status, p.catalog_metadata
       FROM public.product_instances i JOIN public.products p ON p.id=i.product_id
       WHERE i.organization_id=$1 AND i.id=$2`, [organizationId, instanceId]);
    const product = instance.rows[0];
    if (!product) throw new AdministrationDenied();
    let memberName: string | null = null;
    if (membershipId !== null) {
      const member = await client.query<{ name: string }>(`SELECT COALESCE(u.display_name,'Member') AS name
        FROM public.memberships m JOIN public.users u ON u.id=m.user_id
        WHERE m.organization_id=$1 AND m.id=$2`, [organizationId, membershipId]);
      if (!member.rows[0]) throw new AdministrationDenied();
      memberName = member.rows[0].name;
    }
    const catalog = ProductCatalogMetadataV1Schema.safeParse(product.catalog_metadata);
    const supported = catalog.success ? catalog.data.supportedCapabilities : [];
    const policies = await client.query<{ capability: string; membership_id: string | null; revision: number; effect: string }>(
      `SELECT e.capability,e.membership_id,r.revision,r.effect FROM public.entitlement_policies e
       JOIN LATERAL (SELECT revision,effect FROM public.entitlement_policy_revisions
         WHERE organization_id=e.organization_id AND entitlement_id=e.id ORDER BY revision DESC LIMIT 1) r ON true
       WHERE e.organization_id=$1 AND e.product_instance_id=$2
         AND (e.membership_id IS NULL OR e.membership_id=$3)`, [organizationId, instanceId, membershipId]);
    const capabilities = [...new Set([...supported, ...policies.rows.map(row => row.capability)])].sort();
    const settings = capabilities.map(capability => {
      const organization = policies.rows.find(row => row.capability===capability && row.membership_id===null);
      const member = membershipId===null ? undefined : policies.rows.find(row => row.capability===capability && row.membership_id===membershipId);
      const organizationEffect = EntitlementEffectSchema.nullable().parse(organization?.effect ?? null);
      const memberEffect = EntitlementEffectSchema.nullable().parse(member?.effect ?? null);
      const selected = membershipId===null ? organization : member;
      return { capability, effect: EntitlementEffectSchema.parse(selected?.effect ?? 'inherit'), revision: selected?.revision ?? 0,
        organizationEffect, memberEffect, requestedEffect: requestedEntitlementEffect(organizationEffect, memberEffect),
        allowAvailable: catalog.success && product.catalog_status!=='retired' && supported.includes(capability) };
    });
    return { productName: product.productName, membershipId, memberName, settings, providerAccessConfirmed: false as const };
  });
}

/** Only active, unmapped tenant members; existing denied mappings require reconciliation. */
export async function listApplicationMemberCandidates(databaseUrl:string,actorUserId:string,organizationId:string,instanceId:string,search='',page=1) {
  ProductInstanceIdSchema.parse(instanceId);
  const currentPage=Number.isSafeInteger(page)&&page>0?Math.min(page,100000):1;
  const query=search.trim().slice(0,128);
  return readAdministration(databaseUrl,actorUserId,organizationId,['applications.manage'],async client=>{
    const instance=await client.query<{productName:string;available:boolean}>(`SELECT p.display_name AS "productName",
      (i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status<>'retired') AS available
      FROM public.product_instances i JOIN public.products p ON p.id=i.product_id
      WHERE i.organization_id=$1 AND i.id=$2`,[organizationId,instanceId]);
    if(!instance.rows[0])throw new AdministrationDenied();
    const filter=`FROM public.memberships m JOIN public.users u ON u.id=m.user_id
      WHERE m.organization_id=$1 AND m.status='active' AND u.status='active'
      AND COALESCE(u.display_name,'Member') ILIKE $3
      AND NOT EXISTS (SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=m.organization_id AND pm.membership_id=m.id AND pm.product_instance_id=$2)`;
    if(!instance.rows[0].available)return {productName:instance.rows[0].productName,available:false,members:[] as {id:string;name:string}[],total:0,page:currentPage,search:query};
    const values=[organizationId,instanceId,`%${query}%`];
    const count=await client.query<{total:string}>(`SELECT count(*) AS total ${filter}`,values);
    const members=await client.query<{id:string;name:string}>(`SELECT m.id,COALESCE(u.display_name,'Member') AS name ${filter} ORDER BY COALESCE(u.display_name,'Member'),m.id LIMIT 50 OFFSET $4`,[...values,(currentPage-1)*50]);
    return {productName:instance.rows[0].productName,available:true,members:members.rows,total:Number(count.rows[0]!.total),page:currentPage,search:query};
  });
}

export interface UsageLimitDelivery {
  status: 'pending' | 'running' | 'retry_wait' | 'succeeded' | 'failed' | 'superseded';
  attemptCount: number;
  failureCode: string | null;
  updatedAt: string;
  nextAttemptAt: string | null;
  attempts: { number: number; startedAt: string; finishedAt: string | null; outcome: string | null; failureCode: string | null }[];
}
/** Desired quantities only. Null means unconfigured, never unlimited or authorized spend. */
export async function readApplicationUsageLimits(databaseUrl: string, actorUserId: string, organizationId: string, instanceId: string, membershipId: string | null = null) {
  ProductInstanceIdSchema.parse(instanceId);
  if (membershipId !== null) MembershipIdSchema.parse(membershipId);
  return readAdministration(databaseUrl, actorUserId, organizationId, ["budgets.manage"], async client => {
    const instance = await client.query<{ productName: string; catalog_status: string; catalog_metadata: unknown }>(
      `SELECT p.display_name AS "productName",p.catalog_status,p.catalog_metadata FROM public.product_instances i
       JOIN public.products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.id=$2`, [organizationId, instanceId]);
    const product = instance.rows[0]; if (!product) throw new AdministrationDenied();
    let memberName: string | null = null;
    if (membershipId !== null) {
      const member = await client.query<{ name: string }>(`SELECT COALESCE(u.display_name,'Member') AS name FROM public.memberships m
        JOIN public.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.id=$2`, [organizationId, membershipId]);
      if (!member.rows[0]) throw new AdministrationDenied(); memberName = member.rows[0].name;
    }
    const catalog = ProductCatalogMetadataV1Schema.safeParse(product.catalog_metadata);
    const supported = catalog.success ? catalog.data.usageMeters : [];
    // Units are immutable across every scope/window in this tenant instance.
    // Return unit metadata without other members' quantities or identity.
    const units = await client.query<{ meter_key: string; unit: string }>(
      "SELECT DISTINCT meter_key,unit FROM public.product_usage_limits WHERE organization_id=$1 AND product_instance_id=$2", [organizationId, instanceId]);
    const policies = await client.query<{ id: string; meter_key: string; window_key: string; membership_id: string | null; revision: number; maximum_quantity: string }>(
      `SELECT l.id,l.meter_key,l.window_key,l.membership_id,r.revision,r.maximum_quantity FROM public.product_usage_limits l
       JOIN LATERAL (SELECT revision,maximum_quantity FROM public.product_usage_limit_revisions
         WHERE organization_id=l.organization_id AND usage_limit_id=l.id ORDER BY revision DESC LIMIT 1) r ON true
       WHERE l.organization_id=$1 AND l.product_instance_id=$2 AND (l.membership_id IS NULL OR l.membership_id=$3)`, [organizationId, instanceId, membershipId]);
    const jobs = await client.query<{ usage_limit_id: string; revision: number; status: UsageLimitDelivery['status']; attempt_count: number; failure_code: string | null; updated_at: Date; next_attempt_at: Date }>(
      `SELECT j.usage_limit_id,j.revision,j.status,j.attempt_count,j.failure_code,j.updated_at,j.next_attempt_at
       FROM public.usage_limit_jobs j JOIN public.product_usage_limits l ON l.organization_id=j.organization_id AND l.id=j.usage_limit_id
       WHERE l.organization_id=$1 AND l.product_instance_id=$2 AND (l.membership_id IS NULL OR l.membership_id=$3)
         AND j.revision=(SELECT max(r.revision) FROM public.product_usage_limit_revisions r WHERE r.organization_id=l.organization_id AND r.usage_limit_id=l.id)`, [organizationId,instanceId,membershipId]);
    const attempts = await client.query<{ usage_limit_id: string; revision: number; attempt_number: number; started_at: Date; finished_at: Date | null; outcome: string | null; failure_code: string | null }>(
      `SELECT a.usage_limit_id,a.revision,a.attempt_number,a.started_at,a.finished_at,a.outcome,a.failure_code
       FROM public.usage_limit_attempts a JOIN public.product_usage_limits l ON l.organization_id=a.organization_id AND l.id=a.usage_limit_id
       WHERE l.organization_id=$1 AND l.product_instance_id=$2 AND (l.membership_id IS NULL OR l.membership_id=$3)
         AND a.revision=(SELECT max(r.revision) FROM public.product_usage_limit_revisions r WHERE r.organization_id=l.organization_id AND r.usage_limit_id=l.id)
       ORDER BY a.attempt_number`, [organizationId,instanceId,membershipId]);
    const delivery = (policy: typeof policies.rows[number] | undefined): UsageLimitDelivery | null => {
      const job = policy && jobs.rows.find(row => row.usage_limit_id===policy.id && row.revision===policy.revision);
      if (!job) return null;
      return { status:job.status,attemptCount:job.attempt_count,failureCode:job.failure_code,updatedAt:job.updated_at.toISOString(),
        nextAttemptAt:job.status==='retry_wait'?job.next_attempt_at.toISOString():null,
        attempts:attempts.rows.filter(row=>row.usage_limit_id===job.usage_limit_id&&row.revision===job.revision).map(row=>({
          number:row.attempt_number,startedAt:row.started_at.toISOString(),finishedAt:row.finished_at?.toISOString()??null,outcome:row.outcome,failureCode:row.failure_code })) };
    };
    const meters = [...new Set([...supported, ...policies.rows.map(row => row.meter_key)])].sort();
    const settings = meters.flatMap(meterKey => LimitWindowSchema.options.map(window => {
      const organization = policies.rows.find(row => row.meter_key === meterKey && row.window_key === window && row.membership_id === null);
      const member = membershipId === null ? undefined : policies.rows.find(row => row.meter_key === meterKey && row.window_key === window && row.membership_id === membershipId);
      const selected = membershipId === null ? organization : member;
      return { meterKey, window, unit: units.rows.find(row => row.meter_key === meterKey)?.unit ?? null,
        revision: selected?.revision ?? 0, maximumQuantity: selected ? LimitQuantitySchema.parse(selected.maximum_quantity) : null,
        organizationMaximumQuantity: organization ? LimitQuantitySchema.parse(organization.maximum_quantity) : null,
        memberMaximumQuantity: member ? LimitQuantitySchema.parse(member.maximum_quantity) : null,
        delivery: delivery(selected), organizationDelivery: delivery(organization),
        nonzeroAvailable: catalog.success && product.catalog_status !== 'retired' && supported.includes(meterKey) };
    }));
    return { productName: product.productName, membershipId, memberName, settings, providerEnforcementConfirmed: false as const };
  });
}
