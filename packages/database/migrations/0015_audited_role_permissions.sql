INSERT INTO public.permissions (key) VALUES ('roles.manage');
INSERT INTO public.role_permission_defaults (role_key, permission_key) VALUES ('owner','roles.manage'),('admin','roles.manage');
INSERT INTO public.role_permissions (organization_id,role_id,permission_key)
  SELECT organization_id,id,'roles.manage' FROM public.roles WHERE key IN ('owner','admin');

CREATE FUNCTION company_human_private.can_edit_role(org text, target_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT company_human_private.has_capability(org, 'roles.manage') AND EXISTS (
    SELECT 1 FROM public.roles r JOIN public.memberships actor ON actor.organization_id = r.organization_id
    WHERE r.id = target_role AND r.organization_id = org AND r.key <> 'owner'
      AND actor.user_id = NULLIF(current_setting('company_human.user_id', true), '') AND actor.status = 'active'
      AND actor.role_id <> r.id
      AND (r.key <> 'admin' OR actor.role_key = 'owner')
  );
$$;
REVOKE ALL ON FUNCTION company_human_private.can_edit_role(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.can_edit_role(text,text) TO company_human_service;

DROP POLICY grants_bootstrap ON public.role_permissions;
CREATE POLICY grants_insert_authority ON public.role_permissions AS RESTRICTIVE FOR INSERT TO company_human_service
  WITH CHECK (
    (company_human_private.is_bootstrap_owner(organization_id) AND EXISTS (
      SELECT 1 FROM public.roles r JOIN public.role_permission_defaults d ON d.role_key = r.key
      WHERE r.id = role_id AND r.organization_id = role_permissions.organization_id AND d.permission_key = role_permissions.permission_key))
    OR (company_human_private.can_edit_role(organization_id,role_id)
      AND company_human_private.has_capability(organization_id,permission_key))
  );
GRANT DELETE ON public.role_permissions TO company_human_service;
CREATE POLICY grants_delete_authority ON public.role_permissions AS RESTRICTIVE FOR DELETE TO company_human_service
  USING (company_human_private.can_edit_role(organization_id,role_id));
