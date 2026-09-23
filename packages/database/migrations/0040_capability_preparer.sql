-- Background preparation records its own actor while retaining source policy authors.
ALTER TABLE public.member_capability_snapshots ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.member_capability_snapshots ADD COLUMN actor_service_id text;
ALTER TABLE public.member_capability_snapshots ADD CONSTRAINT capability_snapshot_actor
 CHECK (COALESCE((actor_user_id IS NOT NULL AND actor_service_id IS NULL)
   OR (actor_user_id IS NULL AND actor_service_id='capability-preparer'),false));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_capability_preparer') THEN
    CREATE ROLE company_human_capability_preparer NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_capability_preparer;
GRANT SELECT ON public.member_capability_snapshots,
 public.product_instances,public.product_memberships,public.products,public.entitlement_policies,public.entitlement_policy_revisions TO company_human_capability_preparer;
GRANT SELECT(id,organization_id,user_id,status) ON public.memberships TO company_human_capability_preparer;
GRANT SELECT(id,status) ON public.organizations,public.users TO company_human_capability_preparer;
CREATE POLICY capability_preparer_instances ON public.product_instances FOR SELECT TO company_human_capability_preparer
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND product_id=NULLIF(current_setting('company_human.product_id',true),''));
CREATE POLICY capability_preparer_mappings ON public.product_memberships FOR SELECT TO company_human_capability_preparer
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND EXISTS(SELECT 1 FROM public.product_instances i WHERE i.organization_id=product_memberships.organization_id AND i.id=product_memberships.product_instance_id));
CREATE POLICY capability_preparer_snapshots ON public.member_capability_snapshots FOR SELECT TO company_human_capability_preparer
 USING(EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=member_capability_snapshots.organization_id AND pm.id=member_capability_snapshots.product_membership_id));
CREATE POLICY capability_preparer_policies ON public.entitlement_policies FOR SELECT TO company_human_capability_preparer
 USING(EXISTS(SELECT 1 FROM public.product_instances i WHERE i.organization_id=entitlement_policies.organization_id AND i.id=entitlement_policies.product_instance_id));
CREATE POLICY capability_preparer_policy_revisions ON public.entitlement_policy_revisions FOR SELECT TO company_human_capability_preparer
 USING(EXISTS(SELECT 1 FROM public.entitlement_policies e WHERE e.organization_id=entitlement_policy_revisions.organization_id AND e.id=entitlement_policy_revisions.entitlement_id));
CREATE POLICY capability_preparer_memberships ON public.memberships FOR SELECT TO company_human_capability_preparer
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY capability_preparer_orgs ON public.organizations FOR SELECT TO company_human_capability_preparer
 USING(id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY capability_preparer_users ON public.users FOR SELECT TO company_human_capability_preparer
 USING(EXISTS(SELECT 1 FROM public.memberships m WHERE m.user_id=users.id AND m.organization_id=NULLIF(current_setting('company_human.organization_id',true),'')));

GRANT INSERT(organization_id,product_membership_id,policy_revision,source,payload,actor_service_id)
 ON public.member_capability_snapshots TO company_human_capability_preparer;
CREATE POLICY capability_preparer_insert ON public.member_capability_snapshots FOR INSERT TO company_human_capability_preparer
 WITH CHECK(actor_user_id IS NULL AND actor_service_id='capability-preparer'
  AND EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=member_capability_snapshots.organization_id AND pm.id=member_capability_snapshots.product_membership_id));
GRANT INSERT(organization_id,product_membership_id,revision) ON public.capability_jobs TO company_human_capability_preparer;
CREATE POLICY capability_preparer_enqueue ON public.capability_jobs FOR INSERT TO company_human_capability_preparer
 WITH CHECK(EXISTS(SELECT 1 FROM public.member_capability_snapshots s WHERE s.organization_id=capability_jobs.organization_id
  AND s.product_membership_id=capability_jobs.product_membership_id AND s.policy_revision=capability_jobs.revision
  AND s.actor_service_id='capability-preparer'));
GRANT INSERT ON public.identity_audit_events TO company_human_capability_preparer;
CREATE POLICY capability_preparer_audit ON public.identity_audit_events FOR INSERT TO company_human_capability_preparer
 WITH CHECK(organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND actor_type='service'
  AND actor_service_id='capability-preparer' AND actor_user_id IS NULL AND target_type='product_membership'
  AND action='product.capabilities.refreshed'
  AND EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=identity_audit_events.organization_id AND pm.id=identity_audit_events.target_id));
