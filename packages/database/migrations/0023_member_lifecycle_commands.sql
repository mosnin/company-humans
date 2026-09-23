ALTER TABLE public.product_memberships ADD COLUMN desired_revision integer NOT NULL DEFAULT 1 CHECK (desired_revision > 0);
GRANT UPDATE (desired_revision) ON public.product_memberships TO company_human_service;
-- Member administrators can deny product access after suspending/removing the
-- underlying membership, even without permission to configure applications.
CREATE POLICY product_memberships_offboarding_read ON public.product_memberships FOR SELECT TO company_human_service
  USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=product_memberships.organization_id
    AND m.id=product_memberships.membership_id AND m.status IN ('suspended','removed')
    AND company_human_private.can_manage_member(m.organization_id,m.role_key,m.user_id)));
CREATE POLICY product_memberships_offboarding_update ON public.product_memberships FOR UPDATE TO company_human_service
  USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=product_memberships.organization_id
    AND m.id=product_memberships.membership_id AND m.status IN ('suspended','removed')
    AND company_human_private.can_manage_member(m.organization_id,m.role_key,m.user_id)))
  WITH CHECK (NOT desired_enabled AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id=product_memberships.organization_id
    AND m.id=product_memberships.membership_id AND m.status IN ('suspended','removed')
    AND company_human_private.can_manage_member(m.organization_id,m.role_key,m.user_id)));

CREATE TABLE public.product_membership_commands (
  id text PRIMARY KEY CHECK (id ~ '^ch_op_[0-9a-f]{32}$'),
  organization_id text NOT NULL,
  product_membership_id text NOT NULL,
  desired_revision integer NOT NULL CHECK (desired_revision > 0),
  operation text NOT NULL CHECK (operation IN ('provisionMember','suspendMember','removeMember')),
  idempotency_key text NOT NULL UNIQUE,
  actor_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,product_membership_id,desired_revision),
  FOREIGN KEY (organization_id,product_membership_id) REFERENCES public.product_memberships(organization_id,id)
);
ALTER TABLE public.product_membership_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_membership_commands FROM PUBLIC;
GRANT SELECT,INSERT ON public.product_membership_commands TO company_human_service;
CREATE POLICY product_membership_commands_read ON public.product_membership_commands FOR SELECT TO company_human_service
  USING (EXISTS (SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=product_membership_commands.organization_id
    AND pm.id=product_membership_commands.product_membership_id));
CREATE POLICY product_membership_commands_insert ON public.product_membership_commands FOR INSERT TO company_human_service
  WITH CHECK (actor_user_id=NULLIF(current_setting('company_human.user_id',true),'')
    AND EXISTS (SELECT 1 FROM public.product_memberships pm JOIN public.memberships m
      ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
      WHERE pm.organization_id=product_membership_commands.organization_id AND pm.id=product_membership_commands.product_membership_id
        AND pm.desired_revision=product_membership_commands.desired_revision
        AND ((operation='provisionMember' AND pm.desired_enabled AND m.status='active'
          AND company_human_private.has_capability(pm.organization_id,'applications.manage'))
          OR (NOT pm.desired_enabled AND company_human_private.can_manage_member(m.organization_id,m.role_key,m.user_id)
            AND ((operation='suspendMember' AND m.status='suspended') OR (operation='removeMember' AND m.status='removed'))))));
-- Lock the parent membership against concurrent suspension/removal before any
-- mapping can be inserted, including direct restricted-role SQL.
CREATE FUNCTION company_human_private.lock_product_membership_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE member_status text;
BEGIN
  SELECT status INTO member_status FROM public.memberships
    WHERE organization_id=NEW.organization_id AND id=NEW.membership_id FOR SHARE;
  IF member_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Product membership parent is not active' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.lock_product_membership_parent() FROM PUBLIC;
CREATE TRIGGER product_membership_parent_lock BEFORE INSERT ON public.product_memberships
  FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_product_membership_parent();
-- Existing pending intents are carried forward, with their original actor.
INSERT INTO public.product_membership_commands (id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id)
SELECT 'ch_op_'||replace(gen_random_uuid()::text,'-',''),organization_id,id,desired_revision,'provisionMember',id||':member:'||desired_revision,created_by_user_id
FROM public.product_memberships WHERE desired_enabled AND provisioning_status='pending';
