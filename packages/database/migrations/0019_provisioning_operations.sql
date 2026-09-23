-- Initial organization provisioning journal. Provider dispatch/activation is a separate boundary.
CREATE TABLE public.provisioning_operations (
  id text PRIMARY KEY CHECK (id ~ '^ch_op_[0-9a-f]{32}$'),
  organization_id text NOT NULL,
  product_instance_id text NOT NULL,
  operation text NOT NULL CHECK (operation = 'provisionOrganization'),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry_wait','succeeded','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_code text CHECK (length(failure_code) BETWEEN 1 AND 80),
  provider_reference text CHECK (length(provider_reference) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, product_instance_id, operation),
  FOREIGN KEY (organization_id, product_instance_id) REFERENCES public.product_instances(organization_id,id),
  CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status = 'running' OR (lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX provisioning_operations_ready ON public.provisioning_operations (organization_id, next_attempt_at)
  WHERE status IN ('pending','retry_wait','running');
CREATE TABLE public.provisioning_attempts (
  organization_id text NOT NULL,
  operation_id text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 5),
  lease_token uuid NOT NULL,
  actor_user_id text NOT NULL REFERENCES public.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('succeeded','pending','retryable_failure','permanent_failure','lease_expired')),
  failure_code text,
  provider_reference text,
  PRIMARY KEY (operation_id, attempt_number),
  FOREIGN KEY (organization_id, operation_id) REFERENCES public.provisioning_operations(organization_id,id),
  CHECK ((finished_at IS NULL) = (outcome IS NULL))
);
ALTER TABLE public.provisioning_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisioning_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provisioning_operations, public.provisioning_attempts FROM PUBLIC;
GRANT SELECT, INSERT ON public.provisioning_operations, public.provisioning_attempts TO company_human_service;
GRANT UPDATE (status,attempt_count,lease_token,lease_expires_at,next_attempt_at,failure_code,provider_reference,updated_at)
  ON public.provisioning_operations TO company_human_service;
GRANT UPDATE (finished_at,outcome,failure_code,provider_reference) ON public.provisioning_attempts TO company_human_service;
CREATE POLICY provisioning_operations_admin ON public.provisioning_operations TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'))
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY provisioning_attempts_admin ON public.provisioning_attempts TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'))
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage'));
-- Completed attempts are immutable even to the application service credential.
CREATE FUNCTION company_human_private.guard_provisioning_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'Completed provisioning attempt is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.guard_provisioning_attempt() FROM PUBLIC;
CREATE TRIGGER provisioning_attempt_immutable BEFORE UPDATE ON public.provisioning_attempts
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_provisioning_attempt();
-- Recover existing provision intent. No external-only/connected/native mode is dispatched as a create.
INSERT INTO public.provisioning_operations (id,organization_id,product_instance_id,operation,idempotency_key)
SELECT 'ch_op_' || replace(gen_random_uuid()::text,'-',''), organization_id,id,'provisionOrganization',id || ':provision:v1'
FROM public.product_instances WHERE desired_enabled AND mode = 'provisioned' AND provisioning_status = 'pending';
