-- Contributors may inspect only their own assignment state, never provider identities.
GRANT SELECT (id,organization_id,product_instance_id,membership_id,desired_enabled,provisioning_status)
  ON public.product_memberships TO company_human_app;
CREATE POLICY product_memberships_self_read ON public.product_memberships FOR SELECT TO company_human_app
  USING (company_human_private.has_active_membership(organization_id)
    AND EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.organization_id=product_memberships.organization_id AND m.id=product_memberships.membership_id
        AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'') AND m.status='active'));
