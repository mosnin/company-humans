-- Record suspended remote identity creation only. This role cannot grant access,
-- alter mappings, or execute member resume. Current identity is rechecked by the worker.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_bootstrap_worker') THEN
    CREATE ROLE company_human_bootstrap_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_bootstrap_worker;
CREATE TABLE public.member_bootstrap_jobs (
  command_id text PRIMARY KEY,
  organization_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry_wait','succeeded','failed','superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_code text CHECK (failure_code ~ '^[a-zA-Z0-9_.-]{1,80}$'),
  provider_reference text CHECK (length(provider_reference) BETWEEN 1 AND 512),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,command_id),
  FOREIGN KEY (organization_id,command_id) REFERENCES public.product_membership_commands(organization_id,id),
  CHECK ((status='running')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status='running' OR (lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX member_bootstrap_jobs_ready ON public.member_bootstrap_jobs(organization_id,next_attempt_at)
  WHERE status IN ('pending','retry_wait','running');
CREATE TABLE public.member_bootstrap_attempts (
  organization_id text NOT NULL,
  command_id text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 5),
  lease_token uuid NOT NULL,
  worker_role text NOT NULL DEFAULT current_user,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('succeeded','pending','retryable_failure','permanent_failure','lease_expired')),
  failure_code text CHECK (failure_code ~ '^[a-zA-Z0-9_.-]{1,80}$'),
  provider_reference text CHECK (length(provider_reference) BETWEEN 1 AND 512),
  PRIMARY KEY (command_id,attempt_number),
  FOREIGN KEY (organization_id,command_id) REFERENCES public.member_bootstrap_jobs(organization_id,command_id),
  CHECK ((finished_at IS NULL)=(outcome IS NULL))
);
ALTER TABLE public.member_bootstrap_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_bootstrap_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_bootstrap_jobs,public.member_bootstrap_attempts FROM PUBLIC;
GRANT SELECT ON public.product_membership_commands,public.product_memberships,public.product_instances,public.products TO company_human_bootstrap_worker;
CREATE POLICY bootstrap_worker_commands ON public.product_membership_commands FOR SELECT TO company_human_bootstrap_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND operation IN ('provisionMember'));
CREATE POLICY bootstrap_worker_mappings ON public.product_memberships FOR SELECT TO company_human_bootstrap_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY bootstrap_worker_instances ON public.product_instances FOR SELECT TO company_human_bootstrap_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
GRANT SELECT ON public.member_bootstrap_jobs,public.member_bootstrap_attempts TO company_human_bootstrap_worker;
GRANT INSERT (command_id,organization_id) ON public.member_bootstrap_jobs TO company_human_bootstrap_worker;
GRANT UPDATE (status,attempt_count,lease_token,lease_expires_at,next_attempt_at,failure_code,provider_reference,updated_at)
  ON public.member_bootstrap_jobs TO company_human_bootstrap_worker;
GRANT INSERT (organization_id,command_id,attempt_number,lease_token) ON public.member_bootstrap_attempts TO company_human_bootstrap_worker;
GRANT UPDATE (finished_at,outcome,failure_code,provider_reference) ON public.member_bootstrap_attempts TO company_human_bootstrap_worker;
CREATE POLICY bootstrap_worker_jobs ON public.member_bootstrap_jobs TO company_human_bootstrap_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''))
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND EXISTS (SELECT 1 FROM public.product_membership_commands c WHERE c.organization_id=member_bootstrap_jobs.organization_id
      AND c.id=member_bootstrap_jobs.command_id AND c.operation IN ('provisionMember')));
CREATE POLICY bootstrap_worker_attempts ON public.member_bootstrap_attempts TO company_human_bootstrap_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''))
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE TRIGGER member_bootstrap_attempt_immutable BEFORE UPDATE ON public.member_bootstrap_attempts
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_provisioning_attempt();
-- Administrators may inspect receipts, but cannot claim/complete worker jobs.
GRANT SELECT ON public.member_bootstrap_jobs,public.member_bootstrap_attempts TO company_human_service;
CREATE POLICY member_bootstrap_jobs_admin_read ON public.member_bootstrap_jobs FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY member_bootstrap_attempts_admin_read ON public.member_bootstrap_attempts FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));

-- Minimal identity columns needed to revalidate the target, scoped through membership.
GRANT SELECT (id,organization_id,user_id,status) ON public.memberships TO company_human_bootstrap_worker;
GRANT SELECT (id,status) ON public.organizations,public.users TO company_human_bootstrap_worker;
CREATE POLICY bootstrap_membership_read ON public.memberships FOR SELECT TO company_human_bootstrap_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY bootstrap_org_read ON public.organizations FOR SELECT TO company_human_bootstrap_worker
  USING (id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY bootstrap_user_read ON public.users FOR SELECT TO company_human_bootstrap_worker
  USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id=users.id
    AND m.organization_id=NULLIF(current_setting('company_human.organization_id',true),'')));
GRANT INSERT ON public.identity_audit_events TO company_human_bootstrap_worker;
CREATE POLICY bootstrap_audit_insert ON public.identity_audit_events FOR INSERT TO company_human_bootstrap_worker
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND actor_type='service' AND actor_service_id='member-bootstrap-worker' AND actor_user_id IS NULL
    AND target_type='product_membership_command'
    AND action IN ('product.member_bootstrap.claimed','product.member_bootstrap.received','product.member_bootstrap.exhausted','product.member_bootstrap.superseded')
    AND EXISTS (SELECT 1 FROM public.product_membership_commands c
      WHERE c.organization_id=identity_audit_events.organization_id AND c.id=identity_audit_events.target_id
        AND c.operation='provisionMember'));
