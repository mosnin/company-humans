-- Execute previously authorized denial commands independently of the initiating
-- human's later membership. This role cannot grant access or alter mappings.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_member_worker') THEN
    CREATE ROLE company_human_member_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_member_worker;
ALTER TABLE public.product_membership_commands ADD UNIQUE (organization_id,id);
CREATE TABLE public.member_denial_jobs (
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
CREATE INDEX member_denial_jobs_ready ON public.member_denial_jobs(organization_id,next_attempt_at)
  WHERE status IN ('pending','retry_wait','running');
CREATE TABLE public.member_denial_attempts (
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
  FOREIGN KEY (organization_id,command_id) REFERENCES public.member_denial_jobs(organization_id,command_id),
  CHECK ((finished_at IS NULL)=(outcome IS NULL))
);
ALTER TABLE public.member_denial_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_denial_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_denial_jobs,public.member_denial_attempts FROM PUBLIC;
GRANT SELECT ON public.product_membership_commands,public.product_memberships,public.product_instances,public.products TO company_human_member_worker;
CREATE POLICY member_worker_commands ON public.product_membership_commands FOR SELECT TO company_human_member_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'') AND operation IN ('suspendMember','removeMember'));
CREATE POLICY member_worker_mappings ON public.product_memberships FOR SELECT TO company_human_member_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY member_worker_instances ON public.product_instances FOR SELECT TO company_human_member_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
GRANT SELECT ON public.member_denial_jobs,public.member_denial_attempts TO company_human_member_worker;
GRANT INSERT (command_id,organization_id) ON public.member_denial_jobs TO company_human_member_worker;
GRANT UPDATE (status,attempt_count,lease_token,lease_expires_at,next_attempt_at,failure_code,provider_reference,updated_at)
  ON public.member_denial_jobs TO company_human_member_worker;
GRANT INSERT (organization_id,command_id,attempt_number,lease_token) ON public.member_denial_attempts TO company_human_member_worker;
GRANT UPDATE (finished_at,outcome,failure_code,provider_reference) ON public.member_denial_attempts TO company_human_member_worker;
CREATE POLICY member_worker_jobs ON public.member_denial_jobs TO company_human_member_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''))
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND EXISTS (SELECT 1 FROM public.product_membership_commands c WHERE c.organization_id=member_denial_jobs.organization_id
      AND c.id=member_denial_jobs.command_id AND c.operation IN ('suspendMember','removeMember')));
CREATE POLICY member_worker_attempts ON public.member_denial_attempts TO company_human_member_worker
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''))
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE TRIGGER member_denial_attempt_immutable BEFORE UPDATE ON public.member_denial_attempts
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_provisioning_attempt();
-- Administrators may inspect receipts, but cannot claim/complete worker jobs.
GRANT SELECT ON public.member_denial_jobs,public.member_denial_attempts TO company_human_service;
CREATE POLICY member_denial_jobs_admin_read ON public.member_denial_jobs FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY member_denial_attempts_admin_read ON public.member_denial_attempts FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
