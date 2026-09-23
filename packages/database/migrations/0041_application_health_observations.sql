CREATE TABLE public.application_health_observations (
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  product_instance_id text NOT NULL,
  started_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  health jsonb,
  failure_code text CHECK (failure_code IN ('adapter_transport_failure','invalid_adapter_response','future_observation','check_pending','authentication_required','rate_limited','provider_unavailable')),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES public.product_instances(organization_id,id),
  CHECK ((health IS NOT NULL) <> (failure_code IS NOT NULL)),
  CHECK (started_at <= recorded_at),
  CHECK (health IS NULL OR COALESCE(jsonb_typeof(health)='object' AND octet_length(health::text)<=2048
    AND health->>'status' IN ('healthy','degraded','authentication_required','provisioning_failed','rate_limited','suspended','disconnected')
    AND health ? 'checkedAt' AND NOT health ? 'providerStatus',false))
);
CREATE INDEX application_health_latest ON public.application_health_observations(organization_id,product_instance_id,started_at DESC,id DESC);
ALTER TABLE public.application_health_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_health_observations FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.application_health_observations TO company_human_service;
CREATE POLICY application_health_admin_read ON public.application_health_observations FOR SELECT TO company_human_service
 USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND company_human_private.has_capability(organization_id,'applications.manage'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_health_worker') THEN
  CREATE ROLE company_human_health_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_health_worker;
GRANT SELECT ON public.product_instances,public.products TO company_human_health_worker;
GRANT SELECT(id,status) ON public.organizations TO company_human_health_worker;
CREATE POLICY health_worker_instances ON public.product_instances FOR SELECT TO company_human_health_worker
 USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND product_id=NULLIF(current_setting('company_human.product_id',true),''));
CREATE POLICY health_worker_organizations ON public.organizations FOR SELECT TO company_human_health_worker
 USING (id=NULLIF(current_setting('company_human.organization_id',true),''));
GRANT SELECT ON public.application_health_observations TO company_human_health_worker;
GRANT INSERT(id,organization_id,product_instance_id,started_at,health,failure_code) ON public.application_health_observations TO company_human_health_worker;
CREATE POLICY health_worker_observations ON public.application_health_observations TO company_human_health_worker
 USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND EXISTS
  (SELECT 1 FROM public.product_instances i WHERE i.organization_id=application_health_observations.organization_id AND i.id=application_health_observations.product_instance_id))
 WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND EXISTS
  (SELECT 1 FROM public.product_instances i WHERE i.organization_id=application_health_observations.organization_id AND i.id=application_health_observations.product_instance_id));
GRANT INSERT ON public.identity_audit_events TO company_human_health_worker;
CREATE POLICY health_worker_audit ON public.identity_audit_events FOR INSERT TO company_human_health_worker
 WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND actor_type='service'
  AND actor_service_id='health-worker' AND actor_user_id IS NULL AND target_type='product_instance'
  AND action='product.health.observed' AND EXISTS
  (SELECT 1 FROM public.product_instances i WHERE i.organization_id=identity_audit_events.organization_id AND i.id=identity_audit_events.target_id));
