-- Application administrators may suspend enabled member mappings when the
-- product itself is disabled, without changing workspace membership status.
CREATE POLICY product_membership_commands_product_disable ON public.product_membership_commands
  FOR INSERT TO company_human_service
  WITH CHECK (operation='suspendMember'
    AND actor_user_id=NULLIF(current_setting('company_human.user_id',true),'')
    AND company_human_private.has_capability(organization_id,'applications.manage')
    AND EXISTS (SELECT 1 FROM public.product_memberships pm JOIN public.product_instances i
      ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
      WHERE pm.organization_id=product_membership_commands.organization_id
        AND pm.id=product_membership_commands.product_membership_id
        AND pm.desired_revision=product_membership_commands.desired_revision
        AND NOT pm.desired_enabled AND NOT i.desired_enabled));

-- Serialize child insertion with parent disable. The shared lock is held until
-- commit, so a disable either sweeps this child or the INSERT sees disabled.
CREATE FUNCTION company_human_private.lock_product_membership_instance()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE enabled boolean; state text;
BEGIN
  SELECT desired_enabled,provisioning_status INTO enabled,state FROM public.product_instances
    WHERE organization_id=NEW.organization_id AND id=NEW.product_instance_id FOR SHARE;
  IF enabled IS DISTINCT FROM true OR state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Product instance is not active' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.lock_product_membership_instance() FROM PUBLIC;
-- Run after the existing member-parent lock so concurrent member offboarding
-- retains the established lock order.
CREATE TRIGGER product_membership_z_instance_lock BEFORE INSERT ON public.product_memberships
  FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_product_membership_instance();
