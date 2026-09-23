DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_limit_worker') THEN
    CREATE ROLE company_human_limit_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_limit_worker;
GRANT SELECT ON public.usage_limit_jobs,public.usage_limit_attempts,public.product_usage_limits,public.product_usage_limit_revisions,
  public.product_instances,public.product_memberships,public.products TO company_human_limit_worker;
GRANT SELECT (id,organization_id,user_id,status) ON public.memberships TO company_human_limit_worker;
GRANT SELECT (id,status) ON public.organizations,public.users TO company_human_limit_worker;
CREATE POLICY limit_worker_instances ON public.product_instances FOR SELECT TO company_human_limit_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND product_id=NULLIF(current_setting('company_human.product_id',true),''));
CREATE POLICY limit_worker_limits ON public.product_usage_limits FOR SELECT TO company_human_limit_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND EXISTS
    (SELECT 1 FROM public.product_instances i WHERE i.organization_id=product_usage_limits.organization_id AND i.id=product_usage_limits.product_instance_id));
CREATE POLICY limit_worker_revisions ON public.product_usage_limit_revisions FOR SELECT TO company_human_limit_worker
  USING (EXISTS (SELECT 1 FROM public.product_usage_limits l WHERE l.organization_id=product_usage_limit_revisions.organization_id AND l.id=product_usage_limit_revisions.usage_limit_id));
CREATE POLICY limit_worker_mappings ON public.product_memberships FOR SELECT TO company_human_limit_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND EXISTS
    (SELECT 1 FROM public.product_instances i WHERE i.organization_id=product_memberships.organization_id AND i.id=product_memberships.product_instance_id));
CREATE POLICY limit_worker_memberships ON public.memberships FOR SELECT TO company_human_limit_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY limit_worker_orgs ON public.organizations FOR SELECT TO company_human_limit_worker
  USING (id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY limit_worker_users ON public.users FOR SELECT TO company_human_limit_worker
  USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id=users.id AND m.organization_id=NULLIF(current_setting('company_human.organization_id',true),'')));
GRANT UPDATE (status,attempt_count,lease_token,lease_expires_at,next_attempt_at,failure_code,updated_at) ON public.usage_limit_jobs TO company_human_limit_worker;
CREATE POLICY limit_worker_jobs ON public.usage_limit_jobs TO company_human_limit_worker
  USING (EXISTS (SELECT 1 FROM public.product_usage_limits l WHERE l.organization_id=usage_limit_jobs.organization_id AND l.id=usage_limit_jobs.usage_limit_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.product_usage_limits l WHERE l.organization_id=usage_limit_jobs.organization_id AND l.id=usage_limit_jobs.usage_limit_id));
GRANT INSERT (organization_id,usage_limit_id,revision,attempt_number,lease_token) ON public.usage_limit_attempts TO company_human_limit_worker;
GRANT UPDATE (finished_at,outcome,failure_code,provider_reference,apply_receipt,readback_receipt) ON public.usage_limit_attempts TO company_human_limit_worker;
CREATE POLICY limit_worker_attempts ON public.usage_limit_attempts TO company_human_limit_worker
  USING (EXISTS (SELECT 1 FROM public.product_usage_limits l WHERE l.organization_id=usage_limit_attempts.organization_id AND l.id=usage_limit_attempts.usage_limit_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.product_usage_limits l WHERE l.organization_id=usage_limit_attempts.organization_id AND l.id=usage_limit_attempts.usage_limit_id));
GRANT INSERT ON public.identity_audit_events TO company_human_limit_worker;
CREATE POLICY limit_worker_audit ON public.identity_audit_events FOR INSERT TO company_human_limit_worker
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND actor_type='service' AND actor_service_id='usage-limit-worker' AND actor_user_id IS NULL AND target_type='usage_limit'
    AND action IN ('product.usage_limit.claimed','product.usage_limit.received','product.usage_limit.exhausted','product.usage_limit.superseded')
    AND EXISTS (SELECT 1 FROM public.product_usage_limits l WHERE l.organization_id=identity_audit_events.organization_id AND l.id=identity_audit_events.target_id));
