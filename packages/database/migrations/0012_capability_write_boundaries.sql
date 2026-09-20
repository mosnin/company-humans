-- Restrictive policies narrow the tenant scope established in 0010.
-- The service credential is server-only; request context comes from verified identity.
CREATE FUNCTION company_human_private.has_capability(org text, capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT org = NULLIF(current_setting('company_human.organization_id', true), '') AND EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.users u ON u.id = m.user_id AND u.status = 'active'
    JOIN public.organizations o ON o.id = m.organization_id AND o.status = 'active'
    JOIN public.role_permissions p ON p.organization_id = m.organization_id AND p.role_id = m.role_id
    WHERE m.organization_id = org AND m.status = 'active'
      AND m.user_id = NULLIF(current_setting('company_human.user_id', true), '')
      AND p.permission_key = capability
  );
$$;
CREATE FUNCTION company_human_private.is_bootstrap_owner(org text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT org = NULLIF(current_setting('company_human.organization_id', true), '') AND EXISTS (
    SELECT 1 FROM public.organizations o JOIN public.users u ON u.id = o.owner_user_id AND u.status = 'active'
    WHERE o.id = org AND o.status = 'active'
      AND o.owner_user_id = NULLIF(current_setting('company_human.user_id', true), '')
      AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = org)
  );
$$;
CREATE FUNCTION company_human_private.invitation_matches(org text, recipient text, requested_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT recipient = NULLIF(current_setting('company_human.user_id', true), '') AND EXISTS (
    SELECT 1 FROM public.membership_invitations i JOIN public.users u ON u.id = recipient AND u.status = 'active'
    WHERE i.organization_id = org AND i.role_key = requested_role AND i.role_key <> 'owner'
      AND i.recipient_email = lower(u.primary_email) AND i.status = 'pending' AND i.expires_at > now()
      AND i.token_hash = NULLIF(current_setting('company_human.invitation_hash', true), '')
  );
$$;
CREATE FUNCTION company_human_private.can_manage_member(org text, target_role text, target_user text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT company_human_private.has_capability(org, 'members.manage')
    AND target_role <> 'owner'
    AND target_user <> NULLIF(current_setting('company_human.user_id', true), '')
    AND (target_role <> 'admin' OR EXISTS (
      SELECT 1 FROM public.organizations o WHERE o.id = org
        AND o.owner_user_id = NULLIF(current_setting('company_human.user_id', true), '')
    ));
$$;
CREATE FUNCTION company_human_private.can_assign_team(org text, target_team text, requested_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT company_human_private.has_capability(org, 'teams.manage.all') OR (
    requested_role = 'member' AND company_human_private.has_capability(org, 'teams.manage.assigned') AND EXISTS (
      SELECT 1 FROM public.team_memberships tm JOIN public.memberships m ON m.id = tm.membership_id
      WHERE tm.organization_id = org AND tm.team_id = target_team AND tm.team_role = 'manager'
        AND tm.ended_at IS NULL AND m.status = 'active'
        AND m.user_id = NULLIF(current_setting('company_human.user_id', true), '')
    )
  );
$$;
REVOKE ALL ON FUNCTION company_human_private.has_capability(text,text),
  company_human_private.is_bootstrap_owner(text), company_human_private.invitation_matches(text,text,text),
  company_human_private.can_manage_member(text,text,text), company_human_private.can_assign_team(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.has_capability(text,text),
  company_human_private.is_bootstrap_owner(text), company_human_private.invitation_matches(text,text,text),
  company_human_private.can_manage_member(text,text,text), company_human_private.can_assign_team(text,text,text) TO company_human_service;

-- Read credentials cannot perform unaudited writes.
REVOKE UPDATE ON public.organizations FROM company_human_app;
REVOKE UPDATE (name, updated_at) ON public.organizations FROM company_human_app;
DROP POLICY IF EXISTS organization_owner_update ON public.organizations;

CREATE POLICY organization_capability_update ON public.organizations AS RESTRICTIVE FOR UPDATE TO company_human_service
  USING (company_human_private.has_capability(id, 'organization.manage'))
  WITH CHECK (company_human_private.has_capability(id, 'organization.manage'));
CREATE POLICY organization_active_creator ON public.organizations AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (status = 'active' AND billing_account_id IS NULL AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = owner_user_id AND u.status = 'active'));

CREATE POLICY role_bootstrap ON public.roles AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.is_bootstrap_owner(organization_id));
CREATE POLICY grants_bootstrap ON public.role_permissions AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.is_bootstrap_owner(organization_id) AND EXISTS (
    SELECT 1 FROM public.roles r JOIN public.role_permission_defaults d ON d.role_key = r.key
    WHERE r.id = role_id AND r.organization_id = role_permissions.organization_id AND d.permission_key = role_permissions.permission_key));

CREATE POLICY membership_insert_authority ON public.memberships AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (status = 'active' AND sponsor_type = 'organization' AND (
    (company_human_private.is_bootstrap_owner(organization_id) AND role_key = 'owner'
      AND user_id = NULLIF(current_setting('company_human.user_id', true), ''))
    OR company_human_private.invitation_matches(organization_id, user_id, role_key)));
CREATE POLICY membership_update_authority ON public.memberships AS RESTRICTIVE FOR UPDATE TO company_human_service
  USING (company_human_private.can_manage_member(organization_id, role_key, user_id)
    OR (status = 'removed' AND user_id = NULLIF(current_setting('company_human.user_id', true), '')
      AND company_human_private.invitation_organization_for_actor(NULLIF(current_setting('company_human.invitation_hash', true), '')) = organization_id))
  WITH CHECK (company_human_private.can_manage_member(organization_id, role_key, user_id)
    OR (status = 'active' AND sponsor_type = 'organization' AND company_human_private.invitation_matches(organization_id,user_id,role_key)));

CREATE POLICY team_create_authority ON public.teams AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id, 'teams.create'));
CREATE POLICY team_update_authority ON public.teams AS RESTRICTIVE FOR UPDATE TO company_human_service
  USING (company_human_private.has_capability(organization_id, 'teams.manage.all'))
  WITH CHECK (company_human_private.has_capability(organization_id, 'teams.manage.all'));
CREATE POLICY team_assignment_insert ON public.team_memberships AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.can_assign_team(organization_id, team_id, team_role));
CREATE POLICY team_assignment_update ON public.team_memberships AS RESTRICTIVE FOR UPDATE TO company_human_service
  USING (company_human_private.can_assign_team(organization_id, team_id, team_role)
    OR company_human_private.has_capability(organization_id, 'members.manage'))
  WITH CHECK (company_human_private.can_assign_team(organization_id, team_id, team_role)
    OR (ended_at IS NOT NULL AND company_human_private.has_capability(organization_id, 'members.manage')));

CREATE POLICY invitation_insert_authority ON public.membership_invitations AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.can_manage_member(organization_id, role_key, '') AND status = 'pending'
    AND invited_by_user_id = NULLIF(current_setting('company_human.user_id', true), ''));
CREATE POLICY invitation_update_authority ON public.membership_invitations AS RESTRICTIVE FOR UPDATE TO company_human_service
  USING (company_human_private.can_manage_member(organization_id, role_key, '') OR (
    status = 'pending' AND company_human_private.invitation_matches(organization_id,
      NULLIF(current_setting('company_human.user_id', true), ''), role_key)
    AND token_hash = NULLIF(current_setting('company_human.invitation_hash', true), '')))
  WITH CHECK (company_human_private.can_manage_member(organization_id, role_key, '') OR (
    status = 'accepted' AND accepted_by_user_id = NULLIF(current_setting('company_human.user_id', true), '')
    AND token_hash = NULLIF(current_setting('company_human.invitation_hash', true), '')));
CREATE POLICY product_insert_authority ON public.product_instances AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id, 'applications.manage') AND provisioning_status = 'pending');
CREATE POLICY product_update_authority ON public.product_instances AS RESTRICTIVE FOR UPDATE TO company_human_service
  USING (company_human_private.has_capability(organization_id, 'applications.manage'))
  WITH CHECK (company_human_private.has_capability(organization_id, 'applications.manage') AND provisioning_status = 'pending');

-- Tenant identity and ownership cannot be rewritten through general mutation credentials.
CREATE FUNCTION company_human_private.guard_service_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE allowed text[];
BEGIN
  IF NOT pg_has_role(current_user, 'company_human_service', 'member') THEN RETURN NEW; END IF;
  allowed := CASE TG_TABLE_NAME
    WHEN 'organizations' THEN ARRAY['name','updated_at']
    WHEN 'memberships' THEN ARRAY['role_id','role_key','status','joined_at','suspended_at','updated_at']
    WHEN 'teams' THEN ARRAY['name','status','updated_at']
    WHEN 'team_memberships' THEN ARRAY['team_role','ended_at']
    WHEN 'membership_invitations' THEN ARRAY['status','accepted_by_user_id','accepted_at','revoked_at']
    WHEN 'product_instances' THEN ARRAY['desired_enabled','provisioning_status','updated_at']
    ELSE ARRAY[]::text[] END;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Immutable identity or provider fields' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'membership_invitations' AND NEW.status = 'accepted' THEN
    IF OLD.status <> 'pending' OR OLD.expires_at <= now()
      OR NOT company_human_private.invitation_matches(OLD.organization_id, NEW.accepted_by_user_id, OLD.role_key) THEN
      RAISE EXCEPTION 'Invitation acceptance denied' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.guard_service_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.guard_service_update() TO company_human_service;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organizations','memberships','teams','team_memberships','membership_invitations','product_instances'] LOOP
    EXECUTE format('CREATE TRIGGER service_update_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_service_update()', table_name);
  END LOOP;
END $$;
