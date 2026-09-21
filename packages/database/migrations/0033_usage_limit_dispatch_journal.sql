-- A saved revision queues intent; no row here proves provider enforcement.
ALTER TABLE public.product_usage_limit_revisions ADD CONSTRAINT usage_limit_revision_tenant_key UNIQUE (organization_id,usage_limit_id,revision);
CREATE TABLE public.usage_limit_jobs (
  organization_id text NOT NULL,
  usage_limit_id text NOT NULL,
  revision integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry_wait','succeeded','failed','superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_code text CHECK (failure_code ~ '^[a-zA-Z0-9_.-]{1,80}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_limit_id,revision),
  UNIQUE (organization_id,usage_limit_id,revision),
  FOREIGN KEY (organization_id,usage_limit_id,revision) REFERENCES public.product_usage_limit_revisions(organization_id,usage_limit_id,revision),
  CHECK ((status='running')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status='running' OR (lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX usage_limit_jobs_ready ON public.usage_limit_jobs(organization_id,next_attempt_at) WHERE status IN ('pending','retry_wait','running');
CREATE TABLE public.usage_limit_attempts (
  organization_id text NOT NULL,
  usage_limit_id text NOT NULL,
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
  PRIMARY KEY (usage_limit_id,revision,attempt_number),
  FOREIGN KEY (organization_id,usage_limit_id,revision) REFERENCES public.usage_limit_jobs(organization_id,usage_limit_id,revision),
  CHECK ((finished_at IS NULL)=(outcome IS NULL))
);
ALTER TABLE public.usage_limit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_limit_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usage_limit_jobs,public.usage_limit_attempts FROM PUBLIC;
GRANT SELECT ON public.usage_limit_jobs,public.usage_limit_attempts TO company_human_service;
GRANT INSERT (organization_id,usage_limit_id,revision) ON public.usage_limit_jobs TO company_human_service;
CREATE POLICY usage_limit_jobs_admin_read ON public.usage_limit_jobs FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'budgets.manage'));
CREATE POLICY usage_limit_attempts_admin_read ON public.usage_limit_attempts FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'budgets.manage'));
CREATE POLICY usage_limit_jobs_enqueue ON public.usage_limit_jobs FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'budgets.manage')
    AND EXISTS (SELECT 1 FROM public.product_usage_limit_revisions r WHERE r.organization_id=usage_limit_jobs.organization_id
      AND r.usage_limit_id=usage_limit_jobs.usage_limit_id AND r.revision=usage_limit_jobs.revision
      AND r.actor_user_id=NULLIF(current_setting('company_human.user_id',true),'')));
-- Invoker privileges only; no new owner authority.
CREATE FUNCTION company_human_private.enqueue_usage_limit_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.usage_limit_jobs(organization_id,usage_limit_id,revision) VALUES(NEW.organization_id,NEW.usage_limit_id,NEW.revision);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.enqueue_usage_limit_revision() FROM PUBLIC;
CREATE TRIGGER usage_limit_revision_enqueue AFTER INSERT ON public.product_usage_limit_revisions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.enqueue_usage_limit_revision();
-- Schedule current intent only; historical allowances must not be replayed.
INSERT INTO public.usage_limit_jobs(organization_id,usage_limit_id,revision)
  SELECT DISTINCT ON (usage_limit_id) organization_id,usage_limit_id,revision FROM public.product_usage_limit_revisions ORDER BY usage_limit_id,revision DESC;
CREATE FUNCTION company_human_private.guard_usage_limit_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.finished_at IS NOT NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.usage_limit_id IS DISTINCT FROM OLD.usage_limit_id OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number OR NEW.lease_token IS DISTINCT FROM OLD.lease_token
    OR NEW.worker_role IS DISTINCT FROM OLD.worker_role OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Usage limit attempt history is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_usage_limit_attempt() FROM PUBLIC;
CREATE TRIGGER usage_limit_attempt_immutable BEFORE UPDATE ON public.usage_limit_attempts
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_usage_limit_attempt();
