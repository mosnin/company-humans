-- Positive member limits are scoped to the current target authorization fence.
-- Organization aggregate limits and zero hard stops remain deliverable.
ALTER TABLE public.usage_limit_attempts ADD COLUMN claimed_access_revision bigint;
GRANT INSERT(claimed_access_revision) ON public.usage_limit_attempts TO company_human_limit_worker;
GRANT SELECT(role_id) ON public.memberships TO company_human_limit_worker;
GRANT SELECT ON public.permissions,public.role_permissions TO company_human_limit_worker;
CREATE POLICY limit_worker_target_permissions ON public.role_permissions FOR SELECT TO company_human_limit_worker
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE OR REPLACE FUNCTION company_human_private.guard_usage_limit_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.finished_at IS NOT NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
   OR NEW.usage_limit_id IS DISTINCT FROM OLD.usage_limit_id OR NEW.revision IS DISTINCT FROM OLD.revision
   OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number OR NEW.lease_token IS DISTINCT FROM OLD.lease_token
   OR NEW.claimed_access_revision IS DISTINCT FROM OLD.claimed_access_revision
   OR NEW.worker_role IS DISTINCT FROM OLD.worker_role OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
   RAISE EXCEPTION 'Usage limit attempt history is immutable';
 END IF;
 RETURN NEW;
END $$;
