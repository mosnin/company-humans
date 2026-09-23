DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_service') THEN
    CREATE ROLE company_human_service NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_identity') THEN
    CREATE ROLE company_human_identity NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO company_human_service, company_human_identity;
GRANT USAGE ON SCHEMA company_human_private TO company_human_service;
GRANT SELECT, INSERT, UPDATE ON public.users TO company_human_identity;
GRANT SELECT ON public.users, public.products, public.permissions, public.role_permission_defaults TO company_human_service;
GRANT SELECT, INSERT, UPDATE ON public.organizations, public.memberships,
  public.teams, public.team_memberships, public.membership_invitations,
  public.product_instances TO company_human_service;
GRANT SELECT, INSERT ON public.roles, public.role_permissions TO company_human_service;
GRANT INSERT ON public.identity_audit_events TO company_human_service;

CREATE FUNCTION company_human_private.service_scope(target_organization_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT target_organization_id = NULLIF(pg_catalog.current_setting('company_human.organization_id', true), '')
    AND EXISTS (
      SELECT 1 FROM public.organizations AS o
      WHERE o.id = target_organization_id AND o.status = 'active'
        AND (
          EXISTS (
            SELECT 1 FROM public.memberships AS m
            WHERE m.organization_id = o.id
              AND m.user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
              AND m.status = 'active'
          )
          OR (
            o.owner_user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
            AND NOT EXISTS (
              SELECT 1 FROM public.memberships AS m
              WHERE m.organization_id = o.id AND m.user_id = o.owner_user_id
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.membership_invitations AS i
            JOIN public.users AS u ON u.id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
            WHERE i.organization_id = o.id AND i.status = 'pending' AND i.expires_at > now()
              AND i.token_hash = NULLIF(pg_catalog.current_setting('company_human.invitation_hash', true), '')
              AND i.recipient_email = lower(u.primary_email) AND u.status = 'active'
          )
        )
    );
$$;
REVOKE ALL ON FUNCTION company_human_private.service_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.service_scope(text) TO company_human_service;

CREATE FUNCTION company_human_private.invitation_organization_for_actor(invitation_hash text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT i.organization_id FROM public.membership_invitations AS i
  JOIN public.users AS u ON u.id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
  JOIN public.organizations AS o ON o.id = i.organization_id
  WHERE i.token_hash = invitation_hash AND i.status = 'pending' AND i.expires_at > now()
    AND i.recipient_email = lower(u.primary_email) AND u.status = 'active' AND o.status = 'active'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION company_human_private.invitation_organization_for_actor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.invitation_organization_for_actor(text) TO company_human_service;

CREATE POLICY service_organization_scope ON public.organizations FOR ALL TO company_human_service
  USING (company_human_private.service_scope(id))
  WITH CHECK (company_human_private.service_scope(id));
CREATE POLICY service_organization_create ON public.organizations FOR INSERT TO company_human_service
  WITH CHECK (
    id = NULLIF(pg_catalog.current_setting('company_human.organization_id', true), '')
    AND owner_user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
  );
CREATE POLICY service_membership_scope ON public.memberships FOR ALL TO company_human_service
  USING (company_human_private.service_scope(organization_id))
  WITH CHECK (company_human_private.service_scope(organization_id));
CREATE POLICY service_roles_scope ON public.roles FOR ALL TO company_human_service
  USING (company_human_private.service_scope(organization_id))
  WITH CHECK (company_human_private.service_scope(organization_id));
CREATE POLICY service_role_permissions_scope ON public.role_permissions FOR ALL TO company_human_service
  USING (company_human_private.service_scope(organization_id))
  WITH CHECK (company_human_private.service_scope(organization_id));
CREATE POLICY service_teams_scope ON public.teams FOR ALL TO company_human_service
  USING (company_human_private.service_scope(organization_id))
  WITH CHECK (company_human_private.service_scope(organization_id));
CREATE POLICY service_team_memberships_scope ON public.team_memberships FOR ALL TO company_human_service
  USING (company_human_private.service_scope(organization_id))
  WITH CHECK (company_human_private.service_scope(organization_id));
CREATE POLICY service_invitations_scope ON public.membership_invitations FOR ALL TO company_human_service
  USING (company_human_private.service_scope(organization_id))
  WITH CHECK (company_human_private.service_scope(organization_id));
CREATE POLICY service_product_instances_scope ON public.product_instances FOR ALL TO company_human_service
  USING (company_human_private.service_scope(organization_id))
  WITH CHECK (company_human_private.service_scope(organization_id));
CREATE POLICY service_audit_insert ON public.identity_audit_events FOR INSERT TO company_human_service
  WITH CHECK (
    company_human_private.service_scope(organization_id)
    AND actor_user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
  );
