-- CH-22: configuration history for exact-meter budget policies. Evaluation and
-- downstream product enforcement are separate work; these rows grant no usage.
ALTER TABLE public.meter_definitions
  ADD CONSTRAINT meter_definitions_exact_unit_unique UNIQUE (product_id,meter_key,version,unit);

CREATE TABLE public.budget_policies (
  id text PRIMARY KEY CHECK (id ~ '^ch_bud_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  product_id text NOT NULL REFERENCES public.products(id),
  meter_key text NOT NULL,
  meter_version integer NOT NULL CHECK (meter_version BETWEEN 1 AND 2147483647),
  unit text NOT NULL,
  window_key text NOT NULL CHECK (window_key IN ('utc_day','utc_week','utc_month')),
  scope_kind text NOT NULL CHECK (scope_kind IN
    ('organization','product','product_instance','team','member','capability','meter')),
  product_instance_id text,
  team_id text,
  membership_id text,
  capability_key text CHECK (capability_key ~ '^[a-z][a-z0-9._-]{0,127}$'),
  created_by_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (product_id,meter_key,meter_version,unit)
    REFERENCES public.meter_definitions(product_id,meter_key,version,unit),
  FOREIGN KEY (organization_id,product_id,product_instance_id)
    REFERENCES public.product_instances(organization_id,product_id,id),
  FOREIGN KEY (organization_id,team_id) REFERENCES public.teams(organization_id,id),
  FOREIGN KEY (organization_id,membership_id) REFERENCES public.memberships(organization_id,id),
  CONSTRAINT budget_policy_scope_shape CHECK (
    (scope_kind IN ('organization','product','meter')
      AND product_instance_id IS NULL AND team_id IS NULL
      AND membership_id IS NULL AND capability_key IS NULL)
    OR (scope_kind='product_instance' AND product_instance_id IS NOT NULL
      AND team_id IS NULL AND membership_id IS NULL AND capability_key IS NULL)
    OR (scope_kind='team' AND product_instance_id IS NULL AND team_id IS NOT NULL
      AND membership_id IS NULL AND capability_key IS NULL)
    OR (scope_kind='member' AND product_instance_id IS NULL AND team_id IS NULL
      AND membership_id IS NOT NULL AND capability_key IS NULL)
    OR (scope_kind='capability' AND product_instance_id IS NULL AND team_id IS NULL
      AND membership_id IS NULL AND capability_key IS NOT NULL)
  )
);
CREATE INDEX budget_policies_meter_scope_idx ON public.budget_policies
  (organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind);

CREATE TABLE public.budget_policy_revisions (
  organization_id text NOT NULL,
  budget_policy_id text NOT NULL,
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 2147483647),
  maximum_quantity numeric NOT NULL CHECK
    (maximum_quantity >= 0 AND maximum_quantity <= 999999999999.999999
      AND scale(maximum_quantity) <= 6),
  action text NOT NULL CHECK (action IN
    ('informational','warning','manager_approval','soft_pause','hard_stop','emergency_shutdown')),
  status text NOT NULL CHECK (status IN ('active','disabled')),
  actor_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (budget_policy_id,revision),
  FOREIGN KEY (organization_id,budget_policy_id)
    REFERENCES public.budget_policies(organization_id,id)
);
CREATE INDEX budget_policy_revisions_tenant_idx ON public.budget_policy_revisions
  (organization_id,budget_policy_id,revision DESC);

ALTER TABLE public.budget_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_policy_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.budget_policy_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_policies,public.budget_policy_revisions FROM PUBLIC;
GRANT SELECT (product_id,meter_key,version,unit) ON public.meter_definitions TO company_human_service;
GRANT SELECT ON public.budget_policies,public.budget_policy_revisions TO company_human_service;
-- Runtime writers cannot supply historical timestamps; PostgreSQL stamps them.
GRANT INSERT (id,organization_id,product_id,meter_key,meter_version,unit,window_key,
  scope_kind,product_instance_id,team_id,membership_id,capability_key,created_by_user_id)
  ON public.budget_policies TO company_human_service;
GRANT INSERT (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
  ON public.budget_policy_revisions TO company_human_service;
CREATE POLICY budget_policies_admin_read ON public.budget_policies FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'budgets.manage'));
CREATE POLICY budget_policies_admin_insert ON public.budget_policies FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'budgets.manage')
    AND created_by_user_id=NULLIF(current_setting('company_human.user_id',true),''));
CREATE POLICY budget_policy_revisions_admin_read ON public.budget_policy_revisions FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'budgets.manage'));
CREATE POLICY budget_policy_revisions_admin_insert ON public.budget_policy_revisions FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'budgets.manage')
    AND actor_user_id=NULLIF(current_setting('company_human.user_id',true),''));

-- Recheck authority after all writers' transaction locks. A policy INSERT must
-- not commit behind a role, member, organization, user, or catalog revocation.
-- This NOLOGIN owner can lock the two parent rows without giving the service
-- role UPDATE access. Its only callable function exposes no mutation.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_budget_guard') THEN
    CREATE ROLE company_human_budget_guard NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_budget_guard'
    AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unsafe preexisting budget guard role';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_budget_guard;
GRANT SELECT ON public.products,public.organizations,public.memberships,
  public.role_permissions,public.users TO company_human_budget_guard;
-- PostgreSQL requires UPDATE privilege to SELECT FOR SHARE. No SQL writer is
-- granted this role; the SECURITY DEFINER function never issues UPDATE.
GRANT UPDATE(catalog_status) ON public.products TO company_human_budget_guard;
GRANT UPDATE(status) ON public.users TO company_human_budget_guard;
CREATE POLICY budget_guard_organizations ON public.organizations FOR SELECT
  TO company_human_budget_guard USING(true);
CREATE POLICY budget_guard_memberships ON public.memberships FOR SELECT
  TO company_human_budget_guard USING(true);
CREATE POLICY budget_guard_role_permissions ON public.role_permissions FOR SELECT
  TO company_human_budget_guard USING(true);

CREATE FUNCTION company_human_private.lock_budget_policy_authority(org text, product text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor text; actor_member text; actor_status text; authorized boolean;
BEGIN
  actor:=NULLIF(current_setting('company_human.user_id',true),'');
  IF org IS NULL OR product IS NULL OR actor IS NULL
    OR current_setting('transaction_isolation')<>'read committed'
    OR org IS DISTINCT FROM NULLIF(current_setting('company_human.organization_id',true),'') THEN
    RAISE EXCEPTION 'Budget policy authority unavailable' USING ERRCODE='42501';
  END IF;
  -- The first lookup identifies only the stable membership key. Its status,
  -- role, tenant and permission are checked again after any wait.
  SELECT m.id INTO actor_member FROM public.memberships m
    WHERE m.organization_id=org AND m.user_id=actor;
  IF actor_member IS NULL THEN
    RAISE EXCEPTION 'Budget policy authority unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('product-catalog-access:'||product,0));
  -- Catalog metadata fields outside the access hash can still become invalid.
  -- A row share lock fences all concurrent product updates until commit.
  PERFORM 1 FROM public.products p WHERE p.id=product FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budget policy product unavailable' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||org,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('organization-access:'||org,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('product-member-parent:'||org||':'||actor_member,0));
  SELECT u.status INTO actor_status FROM public.users u WHERE u.id=actor FOR SHARE;
  IF actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Budget policy actor unavailable' USING ERRCODE='42501';
  END IF;
  -- VOLATILE commands take a fresh READ COMMITTED snapshot after the locks.
  SELECT EXISTS(SELECT 1 FROM public.organizations o
    JOIN public.memberships m ON m.organization_id=o.id AND m.user_id=actor
    JOIN public.role_permissions rp ON rp.organization_id=o.id AND rp.role_id=m.role_id
    JOIN public.products p ON p.id=product
    WHERE o.id=org AND o.status='active' AND m.id=actor_member
      AND m.status='active' AND rp.permission_key='budgets.manage') INTO authorized;
  IF authorized IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Budget policy authority unavailable' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION company_human_private.lock_budget_policy_authority(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.lock_budget_policy_authority(text,text) TO company_human_service;
GRANT CREATE ON SCHEMA company_human_private TO company_human_budget_guard;
ALTER FUNCTION company_human_private.lock_budget_policy_authority(text,text) OWNER TO company_human_budget_guard;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_budget_guard;

CREATE FUNCTION company_human_private.guard_budget_policy_parent_authority() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.created_by_user_id IS DISTINCT FROM NULLIF(current_setting('company_human.user_id',true),'') THEN
    RAISE EXCEPTION 'Budget policy actor mismatch' USING ERRCODE='42501';
  END IF;
  PERFORM company_human_private.lock_budget_policy_authority(NEW.organization_id,NEW.product_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_budget_policy_parent_authority() FROM PUBLIC;
CREATE TRIGGER budget_policy_authority_lock BEFORE INSERT ON public.budget_policies
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_budget_policy_parent_authority();

CREATE FUNCTION company_human_private.guard_budget_policy_revision_authority() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE product text;
BEGIN
  IF NEW.actor_user_id IS DISTINCT FROM NULLIF(current_setting('company_human.user_id',true),'') THEN
    RAISE EXCEPTION 'Budget policy actor mismatch' USING ERRCODE='42501';
  END IF;
  SELECT p.product_id INTO product FROM public.budget_policies p
    WHERE p.organization_id=NEW.organization_id AND p.id=NEW.budget_policy_id;
  IF product IS NULL THEN RAISE EXCEPTION 'Budget policy unavailable' USING ERRCODE='42501'; END IF;
  PERFORM company_human_private.lock_budget_policy_authority(NEW.organization_id,product);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_budget_policy_revision_authority() FROM PUBLIC;
CREATE TRIGGER budget_policy_authority_lock BEFORE INSERT ON public.budget_policy_revisions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_budget_policy_revision_authority();

CREATE FUNCTION company_human_private.reject_budget_policy_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Budget policy history is immutable'; END;
$$;
REVOKE ALL ON FUNCTION company_human_private.reject_budget_policy_rewrite() FROM PUBLIC;
CREATE TRIGGER immutable_budget_policy BEFORE UPDATE OR DELETE ON public.budget_policies
  FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_budget_policy_rewrite();
CREATE TRIGGER immutable_budget_policy_revision BEFORE UPDATE OR DELETE ON public.budget_policy_revisions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_budget_policy_rewrite();

CREATE FUNCTION company_human_private.guard_budget_policy_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE latest integer;
DECLARE binding record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('budget-policy-revision:'||NEW.budget_policy_id,0));
  SELECT COALESCE(max(revision),0) INTO latest FROM public.budget_policy_revisions
    WHERE organization_id=NEW.organization_id AND budget_policy_id=NEW.budget_policy_id;
  IF NEW.revision::bigint<>latest::bigint+1 THEN
    RAISE EXCEPTION 'Budget policy revision must follow current revision';
  END IF;
  IF NEW.status='active' THEN
    SELECT b.meter_key,b.scope_kind,b.capability_key,p.catalog_status,p.catalog_metadata
      INTO binding FROM public.budget_policies b JOIN public.products p ON p.id=b.product_id
      WHERE b.organization_id=NEW.organization_id AND b.id=NEW.budget_policy_id;
    IF NOT FOUND OR binding.catalog_status<>'ready'
      OR company_human_private.ready_catalog_metadata_valid(binding.catalog_metadata) IS DISTINCT FROM TRUE
      OR NOT COALESCE((binding.catalog_metadata->'usageMeters') ? binding.meter_key,false)
      OR (binding.scope_kind='capability' AND NOT COALESCE(
        (binding.catalog_metadata->'supportedCapabilities') ? binding.capability_key,false)) THEN
      RAISE EXCEPTION 'Active budget policy requires a ready product and declared meter or capability';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_budget_policy_revision() FROM PUBLIC;
CREATE TRIGGER budget_policy_revision_sequence BEFORE INSERT ON public.budget_policy_revisions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_budget_policy_revision();
