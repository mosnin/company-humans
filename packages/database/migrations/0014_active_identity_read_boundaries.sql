CREATE OR REPLACE FUNCTION company_human_private.has_active_membership(target_organization_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.users u ON u.id = m.user_id AND u.status = 'active'
    JOIN public.organizations o ON o.id = m.organization_id AND o.status = 'active'
    WHERE m.organization_id = target_organization_id AND m.status = 'active'
      AND m.user_id = NULLIF(current_setting('company_human.user_id', true), '')
  );
$$;
DROP POLICY membership_self_read ON public.memberships;
CREATE POLICY membership_self_read ON public.memberships FOR SELECT TO company_human_app
  USING (user_id = NULLIF(current_setting('company_human.user_id', true), '') AND status = 'active'
    AND company_human_private.has_active_membership(organization_id));

DROP POLICY invitation_admin_read ON public.membership_invitations;
CREATE POLICY invitation_admin_read ON public.membership_invitations FOR SELECT TO company_human_app
  USING (company_human_private.has_active_membership(organization_id) AND EXISTS (
    SELECT 1 FROM public.memberships m JOIN public.role_permissions p ON p.role_id = m.role_id AND p.organization_id = m.organization_id
    WHERE m.organization_id = membership_invitations.organization_id
      AND m.user_id = NULLIF(current_setting('company_human.user_id', true), '') AND p.permission_key = 'members.manage'));
DROP POLICY identity_audit_admin_read ON public.identity_audit_events;
CREATE POLICY identity_audit_admin_read ON public.identity_audit_events FOR SELECT TO company_human_app
  USING (company_human_private.has_active_membership(organization_id) AND EXISTS (
    SELECT 1 FROM public.memberships m JOIN public.role_permissions p ON p.role_id = m.role_id AND p.organization_id = m.organization_id
    WHERE m.organization_id = identity_audit_events.organization_id
      AND m.user_id = NULLIF(current_setting('company_human.user_id', true), '') AND p.permission_key = 'audit.read.all'));
