CREATE TABLE public.product_usage_limits (
  id text PRIMARY KEY CHECK (id ~ '^ch_lim_[0-9a-f]{32}$'),
  organization_id text NOT NULL,
  product_instance_id text NOT NULL,
  membership_id text,
  meter_key text NOT NULL CHECK (meter_key ~ '^[a-z][a-z0-9._-]{0,127}$'),
  unit text NOT NULL CHECK (unit ~ '^[a-z][a-z0-9._-]{0,127}$'),
  window_key text NOT NULL CHECK (window_key IN ('utc_day','utc_week','utc_month')),
  created_by_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES public.product_instances(organization_id,id),
  FOREIGN KEY (organization_id,membership_id) REFERENCES public.memberships(organization_id,id)
);
CREATE UNIQUE INDEX usage_limit_org_default ON public.product_usage_limits(organization_id,product_instance_id,meter_key,window_key) WHERE membership_id IS NULL;
CREATE UNIQUE INDEX usage_limit_member_override ON public.product_usage_limits(organization_id,product_instance_id,membership_id,meter_key,window_key) WHERE membership_id IS NOT NULL;
CREATE TABLE public.product_usage_limit_revisions (
  organization_id text NOT NULL,
  usage_limit_id text NOT NULL,
  revision integer NOT NULL CHECK (revision>0),
  maximum_quantity numeric NOT NULL CHECK (maximum_quantity>=0 AND maximum_quantity<=999999999999.999999 AND scale(maximum_quantity)<=6),
  actor_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_limit_id,revision),
  FOREIGN KEY (organization_id,usage_limit_id) REFERENCES public.product_usage_limits(organization_id,id)
);
ALTER TABLE public.product_usage_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_usage_limit_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_usage_limits,public.product_usage_limit_revisions FROM PUBLIC;
GRANT SELECT,INSERT ON public.product_usage_limits,public.product_usage_limit_revisions TO company_human_service;
CREATE POLICY usage_limits_read ON public.product_usage_limits FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'budgets.manage'));
CREATE POLICY usage_limits_insert ON public.product_usage_limits FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'budgets.manage')
    AND created_by_user_id=NULLIF(current_setting('company_human.user_id',true),''));
CREATE POLICY usage_limit_revisions_read ON public.product_usage_limit_revisions FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'budgets.manage'));
CREATE POLICY usage_limit_revisions_insert ON public.product_usage_limit_revisions FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'budgets.manage')
    AND actor_user_id=NULLIF(current_setting('company_human.user_id',true),''));
CREATE POLICY budget_admin_instance_read ON public.product_instances FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'budgets.manage'));
-- Changing intent appends a revision. Unit and interpretation cannot be rewritten.
CREATE FUNCTION company_human_private.guard_usage_limit_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE latest integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('usage-limit-revision:'||NEW.usage_limit_id,0));
  SELECT COALESCE(max(revision),0) INTO latest FROM public.product_usage_limit_revisions
    WHERE organization_id=NEW.organization_id AND usage_limit_id=NEW.usage_limit_id;
  IF NEW.revision::bigint<>latest::bigint+1 THEN
    RAISE EXCEPTION 'Usage limit revision must follow current revision';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_usage_limit_revision() FROM PUBLIC;
CREATE TRIGGER usage_limit_revision_sequence BEFORE INSERT ON public.product_usage_limit_revisions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_usage_limit_revision();
-- All scopes/windows for a product-instance meter must agree on its unit.
CREATE FUNCTION company_human_private.guard_usage_limit_unit() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('usage-limit-unit:'||NEW.organization_id||':'||NEW.product_instance_id||':'||NEW.meter_key,0));
  IF EXISTS (SELECT 1 FROM public.product_usage_limits l WHERE l.organization_id=NEW.organization_id
    AND l.product_instance_id=NEW.product_instance_id AND l.meter_key=NEW.meter_key AND l.unit<>NEW.unit) THEN
    RAISE EXCEPTION 'Usage limit unit is immutable across scopes';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_usage_limit_unit() FROM PUBLIC;
CREATE TRIGGER usage_limit_unit_consistency BEFORE INSERT ON public.product_usage_limits
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_usage_limit_unit();
