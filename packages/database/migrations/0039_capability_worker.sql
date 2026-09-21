-- A saved revision queues intent; no row here proves provider enforcement.
ALTER TABLE public.member_capability_snapshots ADD CONSTRAINT capability_revision_tenant_key UNIQUE (organization_id,product_membership_id,policy_revision);
CREATE TABLE public.capability_jobs (
  organization_id text NOT NULL,
  product_membership_id text NOT NULL,
  revision integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry_wait','succeeded','failed','superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_code text CHECK (failure_code ~ '^[a-zA-Z0-9_.-]{1,80}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_membership_id,revision),
  UNIQUE (organization_id,product_membership_id,revision),
  FOREIGN KEY (organization_id,product_membership_id,revision) REFERENCES public.member_capability_snapshots(organization_id,product_membership_id,policy_revision),
  CHECK ((status='running')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status='running' OR (lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX capability_jobs_ready ON public.capability_jobs(organization_id,next_attempt_at) WHERE status IN ('pending','retry_wait','running');
CREATE TABLE public.capability_attempts (
  organization_id text NOT NULL,
  product_membership_id text NOT NULL,
  revision integer NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 5),
  lease_token uuid NOT NULL,
  worker_role text NOT NULL DEFAULT current_user,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('succeeded','pending','retryable_failure','permanent_failure','lease_expired')),
  failure_code text CHECK (failure_code ~ '^[a-zA-Z0-9_.-]{1,80}$'),
  provider_reference text CHECK (length(provider_reference) BETWEEN 1 AND 512),
  apply_receipt jsonb CHECK (apply_receipt IS NULL OR jsonb_typeof(apply_receipt)='object'),
  readback_receipt jsonb CHECK (readback_receipt IS NULL OR jsonb_typeof(readback_receipt)='object'),
  PRIMARY KEY (product_membership_id,revision,attempt_number),
  FOREIGN KEY (organization_id,product_membership_id,revision) REFERENCES public.capability_jobs(organization_id,product_membership_id,revision),
  CHECK ((finished_at IS NULL)=(outcome IS NULL))
);
ALTER TABLE public.capability_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capability_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capability_jobs,public.capability_attempts FROM PUBLIC;
GRANT SELECT ON public.capability_jobs,public.capability_attempts TO company_human_service;
GRANT INSERT (organization_id,product_membership_id,revision) ON public.capability_jobs TO company_human_service;
CREATE POLICY capability_jobs_admin_read ON public.capability_jobs FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY capability_attempts_admin_read ON public.capability_attempts FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY capability_jobs_enqueue ON public.capability_jobs FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage')
    AND EXISTS (SELECT 1 FROM public.member_capability_snapshots r WHERE r.organization_id=capability_jobs.organization_id
      AND r.product_membership_id=capability_jobs.product_membership_id AND r.policy_revision=capability_jobs.revision
      AND r.actor_user_id=NULLIF(current_setting('company_human.user_id',true),'')));
-- Invoker privileges only; no new owner authority.
CREATE FUNCTION company_human_private.enqueue_capability_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.capability_jobs(organization_id,product_membership_id,revision) VALUES(NEW.organization_id,NEW.product_membership_id,NEW.policy_revision);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.enqueue_capability_revision() FROM PUBLIC;
CREATE TRIGGER capability_revision_enqueue AFTER INSERT ON public.member_capability_snapshots
  FOR EACH ROW EXECUTE FUNCTION company_human_private.enqueue_capability_revision();
-- Schedule current intent only; historical allowances must not be replayed.
INSERT INTO public.capability_jobs(organization_id,product_membership_id,revision)
  SELECT DISTINCT ON (product_membership_id) organization_id,product_membership_id,policy_revision FROM public.member_capability_snapshots ORDER BY product_membership_id,policy_revision DESC;
CREATE FUNCTION company_human_private.guard_capability_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.finished_at IS NOT NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.product_membership_id IS DISTINCT FROM OLD.product_membership_id OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number OR NEW.lease_token IS DISTINCT FROM OLD.lease_token
    OR NEW.worker_role IS DISTINCT FROM OLD.worker_role OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Capability attempt history is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_capability_attempt() FROM PUBLIC;
CREATE TRIGGER capability_attempt_immutable BEFORE UPDATE ON public.capability_attempts
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_capability_attempt();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_capability_worker') THEN
    CREATE ROLE company_human_capability_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_capability_worker;
GRANT SELECT ON public.capability_jobs,public.capability_attempts,public.member_capability_snapshots,
 public.product_instances,public.product_memberships,public.products,public.entitlement_policies,public.entitlement_policy_revisions TO company_human_capability_worker;
GRANT SELECT(id,organization_id,user_id,status) ON public.memberships TO company_human_capability_worker;
GRANT SELECT(id,status) ON public.organizations,public.users TO company_human_capability_worker;
CREATE POLICY capability_worker_instances ON public.product_instances FOR SELECT TO company_human_capability_worker
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND product_id=NULLIF(current_setting('company_human.product_id',true),''));
CREATE POLICY capability_worker_mappings ON public.product_memberships FOR SELECT TO company_human_capability_worker
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND EXISTS(SELECT 1 FROM public.product_instances i WHERE i.organization_id=product_memberships.organization_id AND i.id=product_memberships.product_instance_id));
CREATE POLICY capability_worker_snapshots ON public.member_capability_snapshots FOR SELECT TO company_human_capability_worker
 USING(EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=member_capability_snapshots.organization_id AND pm.id=member_capability_snapshots.product_membership_id));
CREATE POLICY capability_worker_policies ON public.entitlement_policies FOR SELECT TO company_human_capability_worker
 USING(EXISTS(SELECT 1 FROM public.product_instances i WHERE i.organization_id=entitlement_policies.organization_id AND i.id=entitlement_policies.product_instance_id));
CREATE POLICY capability_worker_policy_revisions ON public.entitlement_policy_revisions FOR SELECT TO company_human_capability_worker
 USING(EXISTS(SELECT 1 FROM public.entitlement_policies e WHERE e.organization_id=entitlement_policy_revisions.organization_id AND e.id=entitlement_policy_revisions.entitlement_id));
CREATE POLICY capability_worker_memberships ON public.memberships FOR SELECT TO company_human_capability_worker
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY capability_worker_orgs ON public.organizations FOR SELECT TO company_human_capability_worker
 USING(id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY capability_worker_users ON public.users FOR SELECT TO company_human_capability_worker
 USING(EXISTS(SELECT 1 FROM public.memberships m WHERE m.user_id=users.id AND m.organization_id=NULLIF(current_setting('company_human.organization_id',true),'')));
GRANT UPDATE(status,attempt_count,lease_token,lease_expires_at,next_attempt_at,failure_code,updated_at) ON public.capability_jobs TO company_human_capability_worker;
CREATE POLICY capability_worker_jobs ON public.capability_jobs TO company_human_capability_worker
 USING(EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=capability_jobs.organization_id AND pm.id=capability_jobs.product_membership_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=capability_jobs.organization_id AND pm.id=capability_jobs.product_membership_id));
GRANT INSERT(organization_id,product_membership_id,revision,attempt_number,lease_token) ON public.capability_attempts TO company_human_capability_worker;
GRANT UPDATE(finished_at,outcome,failure_code,provider_reference,apply_receipt,readback_receipt) ON public.capability_attempts TO company_human_capability_worker;
CREATE POLICY capability_worker_attempts ON public.capability_attempts TO company_human_capability_worker
 USING(EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=capability_attempts.organization_id AND pm.id=capability_attempts.product_membership_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=capability_attempts.organization_id AND pm.id=capability_attempts.product_membership_id));
GRANT INSERT ON public.identity_audit_events TO company_human_capability_worker;
CREATE POLICY capability_worker_audit ON public.identity_audit_events FOR INSERT TO company_human_capability_worker
 WITH CHECK(organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND actor_type='service'
  AND actor_service_id='capability-worker' AND actor_user_id IS NULL AND target_type='product_membership'
  AND action IN ('product.capability.claimed','product.capability.received','product.capability.exhausted','product.capability.superseded')
  AND EXISTS(SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=identity_audit_events.organization_id AND pm.id=identity_audit_events.target_id));
