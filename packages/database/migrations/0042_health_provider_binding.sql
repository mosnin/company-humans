-- Bind observations to the exact remote organization checked. Legacy null bindings are never current.
ALTER TABLE public.application_health_observations ADD COLUMN external_organization_id text;
GRANT INSERT(external_organization_id) ON public.application_health_observations TO company_human_health_worker;
