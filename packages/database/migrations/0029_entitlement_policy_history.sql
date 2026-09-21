CREATE TABLE public.entitlement_policies (
  id text PRIMARY KEY CHECK (id ~ '^ch_ent_[0-9a-f]{32}$'),
  organization_id text NOT NULL,
  product_instance_id text NOT NULL,
  membership_id text,
  capability text NOT NULL CHECK (capability ~ '^[a-z][a-z0-9._-]{0,127}$'),
  created_by_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES public.product_instances(organization_id,id),
  FOREIGN KEY (organization_id,membership_id) REFERENCES public.memberships(organization_id,id)
);
CREATE UNIQUE INDEX entitlement_org_default ON public.entitlement_policies(organization_id,product_instance_id,capability) WHERE membership_id IS NULL;
CREATE UNIQUE INDEX entitlement_member_override ON public.entitlement_policies(organization_id,product_instance_id,membership_id,capability) WHERE membership_id IS NOT NULL;
CREATE TABLE public.entitlement_policy_revisions (
  organization_id text NOT NULL,
  entitlement_id text NOT NULL,
  revision integer NOT NULL CHECK (revision>0),
  effect text NOT NULL CHECK (effect IN ('allow','deny','inherit')),
  actor_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entitlement_id,revision),
  FOREIGN KEY (organization_id,entitlement_id) REFERENCES public.entitlement_policies(organization_id,id)
);
ALTER TABLE public.entitlement_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_policy_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entitlement_policies,public.entitlement_policy_revisions FROM PUBLIC;
GRANT SELECT,INSERT ON public.entitlement_policies,public.entitlement_policy_revisions TO company_human_service;
CREATE POLICY entitlement_policies_admin_read ON public.entitlement_policies FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY entitlement_policies_admin_insert ON public.entitlement_policies FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage')
    AND created_by_user_id=NULLIF(current_setting('company_human.user_id',true),''));
CREATE POLICY entitlement_revisions_admin_read ON public.entitlement_policy_revisions FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY entitlement_revisions_admin_insert ON public.entitlement_policy_revisions FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage')
    AND actor_user_id=NULLIF(current_setting('company_human.user_id',true),''));
-- No UPDATE/DELETE grants: changing intent always adds a new revision.

-- Serial sequence enforced even when a restricted caller bypasses the server helper.
CREATE FUNCTION company_human_private.guard_entitlement_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE latest integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('entitlement-revision:' || NEW.entitlement_id,0));
  SELECT COALESCE(max(revision),0) INTO latest FROM public.entitlement_policy_revisions
    WHERE organization_id=NEW.organization_id AND entitlement_id=NEW.entitlement_id;
  IF NEW.revision::bigint <> latest::bigint+1 THEN
    RAISE EXCEPTION 'Entitlement revision must follow current revision';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_entitlement_revision() FROM PUBLIC;
CREATE TRIGGER entitlement_revision_sequence BEFORE INSERT ON public.entitlement_policy_revisions
FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_entitlement_revision();
