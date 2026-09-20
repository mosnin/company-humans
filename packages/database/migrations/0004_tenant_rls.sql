DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_app') THEN
    CREATE ROLE company_human_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS company_human_private;
REVOKE ALL ON SCHEMA company_human_private FROM PUBLIC;
GRANT USAGE ON SCHEMA company_human_private TO company_human_app;

CREATE FUNCTION company_human_private.has_active_membership(target_organization_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships AS m
    WHERE m.organization_id = target_organization_id
      AND m.user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
      AND m.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION company_human_private.has_active_membership(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.has_active_membership(text) TO company_human_app;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_member_read ON public.organizations
  FOR SELECT TO company_human_app
  USING (company_human_private.has_active_membership(id));
CREATE POLICY organization_owner_update ON public.organizations
  FOR UPDATE TO company_human_app
  USING (
    owner_user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
    AND company_human_private.has_active_membership(id)
  )
  WITH CHECK (
    owner_user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
    AND company_human_private.has_active_membership(id)
  );
CREATE POLICY membership_self_read ON public.memberships
  FOR SELECT TO company_human_app
  USING (
    user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
    AND status = 'active'
  );

REVOKE ALL ON public.organizations, public.memberships FROM PUBLIC;
GRANT SELECT ON public.organizations, public.memberships TO company_human_app;
GRANT UPDATE (name, updated_at) ON public.organizations TO company_human_app;
