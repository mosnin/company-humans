-- Desired staged configuration history, never an access grant or provider receipt.
CREATE TABLE public.member_capability_snapshots (
  organization_id text NOT NULL,
  product_membership_id text NOT NULL,
  policy_revision integer NOT NULL CHECK (policy_revision > 0),
  source jsonb NOT NULL CHECK (jsonb_typeof(source)='object'),
  payload jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(payload)='object'
    AND payload->>'organizationId'=organization_id
    AND payload->>'policyRevision'=policy_revision::text
    AND payload->>'memberAccess'='suspended'
    AND payload->>'mode'='replace_all'
    AND jsonb_typeof(payload->'capabilities')='array',false)),
  actor_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_membership_id,policy_revision),
  FOREIGN KEY (organization_id,product_membership_id) REFERENCES public.product_memberships(organization_id,id)
);
ALTER TABLE public.member_capability_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_capability_snapshots FROM PUBLIC;
GRANT SELECT,INSERT ON public.member_capability_snapshots TO company_human_service;
CREATE POLICY capability_snapshot_read ON public.member_capability_snapshots FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY capability_snapshot_insert ON public.member_capability_snapshots FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage')
    AND actor_user_id=NULLIF(current_setting('company_human.user_id',true),''));
CREATE FUNCTION company_human_private.guard_capability_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE latest integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('capability-snapshot:' || NEW.product_membership_id,0));
  SELECT COALESCE(max(policy_revision),0) INTO latest FROM public.member_capability_snapshots
    WHERE organization_id=NEW.organization_id AND product_membership_id=NEW.product_membership_id;
  IF NEW.policy_revision::bigint<>latest::bigint+1 THEN
    RAISE EXCEPTION 'Capability snapshot revision must follow current revision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_memberships pm WHERE pm.organization_id=NEW.organization_id
    AND pm.id=NEW.product_membership_id AND pm.product_instance_id=NEW.payload->>'productInstanceId'
    AND pm.membership_id=NEW.payload->>'membershipId') THEN
    RAISE EXCEPTION 'Capability snapshot target mismatch';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_capability_snapshot() FROM PUBLIC;
CREATE TRIGGER capability_snapshot_sequence BEFORE INSERT ON public.member_capability_snapshots
FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_capability_snapshot();
