-- CH-27: native workspace presentation modules. Connected products remain
-- separate product instances; these rows grant no product or route access.
CREATE TABLE public.workspace_module_revisions (
  organization_id text NOT NULL REFERENCES public.organizations(id),
  module_key text NOT NULL CHECK (module_key IN
    ('work','crm','referrals','earnings','leaderboard','team','context','creator')),
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 2147483647),
  enabled boolean NOT NULL,
  actor_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id,module_key,revision)
);
CREATE INDEX workspace_module_latest_idx ON public.workspace_module_revisions
  (organization_id,module_key,revision DESC);
ALTER TABLE public.workspace_module_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_module_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_module_revisions FROM PUBLIC;
GRANT SELECT (organization_id,module_key,revision,enabled)
  ON public.workspace_module_revisions TO company_human_app;
GRANT SELECT ON public.workspace_module_revisions TO company_human_service;
GRANT INSERT (organization_id,module_key,revision,enabled,actor_user_id)
  ON public.workspace_module_revisions TO company_human_service;
CREATE POLICY workspace_module_member_read ON public.workspace_module_revisions FOR SELECT
  TO company_human_app
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND company_human_private.has_active_membership(organization_id));
CREATE POLICY workspace_module_admin_read ON public.workspace_module_revisions FOR SELECT
  TO company_human_service
  USING (company_human_private.has_capability(organization_id,'organization.manage'));
CREATE POLICY workspace_module_admin_insert ON public.workspace_module_revisions FOR INSERT
  TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'organization.manage')
    AND actor_user_id=NULLIF(current_setting('company_human.user_id',true),''));

-- Reuse the established non-login, non-inherited authority guard from 0070.
-- Its existing privileges can lock users and read organizations, memberships,
-- and role grants without giving the runtime role those privileges.
CREATE FUNCTION company_human_private.lock_workspace_module_authority(org text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor text; actor_member text; actor_status text; authorized boolean;
BEGIN
  actor:=NULLIF(current_setting('company_human.user_id',true),'');
  IF org IS NULL OR actor IS NULL
    OR current_setting('transaction_isolation')<>'read committed'
    OR org IS DISTINCT FROM NULLIF(current_setting('company_human.organization_id',true),'') THEN
    RAISE EXCEPTION 'Workspace module authority unavailable' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO actor_member FROM public.memberships m
    WHERE m.organization_id=org AND m.user_id=actor;
  IF actor_member IS NULL THEN
    RAISE EXCEPTION 'Workspace module authority unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||org,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('organization-access:'||org,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('product-member-parent:'||org||':'||actor_member,0));
  SELECT u.status INTO actor_status FROM public.users u WHERE u.id=actor FOR SHARE;
  IF actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Workspace module actor unavailable' USING ERRCODE='42501';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.organizations o
    JOIN public.memberships m ON m.organization_id=o.id AND m.user_id=actor
    JOIN public.role_permissions rp ON rp.organization_id=o.id AND rp.role_id=m.role_id
    WHERE o.id=org AND o.status='active' AND m.id=actor_member AND m.status='active'
      AND rp.permission_key='organization.manage') INTO authorized;
  IF authorized IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Workspace module authority unavailable' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION company_human_private.lock_workspace_module_authority(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.lock_workspace_module_authority(text) TO company_human_service;
GRANT CREATE ON SCHEMA company_human_private TO company_human_budget_guard;
ALTER FUNCTION company_human_private.lock_workspace_module_authority(text) OWNER TO company_human_budget_guard;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_budget_guard;

CREATE FUNCTION company_human_private.guard_workspace_module_revision()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE latest integer;
BEGIN
  IF NEW.actor_user_id IS DISTINCT FROM NULLIF(current_setting('company_human.user_id',true),'') THEN
    RAISE EXCEPTION 'Workspace module actor mismatch' USING ERRCODE='42501';
  END IF;
  PERFORM company_human_private.lock_workspace_module_authority(NEW.organization_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'workspace-module-revision:'||NEW.organization_id||':'||NEW.module_key,0));
  SELECT COALESCE(max(revision),0) INTO latest FROM public.workspace_module_revisions
    WHERE organization_id=NEW.organization_id AND module_key=NEW.module_key;
  IF NEW.revision::bigint<>latest::bigint+1 THEN
    RAISE EXCEPTION 'Workspace module revision conflict' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_workspace_module_revision() FROM PUBLIC;
CREATE TRIGGER workspace_module_revision_guard BEFORE INSERT ON public.workspace_module_revisions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_workspace_module_revision();

-- Direct SQL inserts receive the same immutable audit as repository writes.
-- Any audit failure rolls the revision back in its transaction.
CREATE FUNCTION company_human_private.audit_workspace_module_revision()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE prior record; actor_member text; audit_id text; request_id text; before_state jsonb;
  after_state jsonb; envelope jsonb;
BEGIN
  SELECT r.revision,r.enabled INTO prior FROM public.workspace_module_revisions r
    WHERE r.organization_id=NEW.organization_id AND r.module_key=NEW.module_key
      AND r.revision<NEW.revision ORDER BY r.revision DESC LIMIT 1;
  SELECT m.id INTO actor_member FROM public.memberships m
    WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.actor_user_id;
  IF actor_member IS NULL THEN
    RAISE EXCEPTION 'Workspace module audit actor unavailable' USING ERRCODE='42501';
  END IF;
  audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');
  request_id:=gen_random_uuid()::text;
  IF prior.revision IS NOT NULL THEN
    before_state:=jsonb_build_object('revision',prior.revision,'enabled',prior.enabled);
  END IF;
  after_state:=jsonb_build_object('revision',NEW.revision,'moduleKey',NEW.module_key,'enabled',NEW.enabled);
  envelope:=jsonb_build_object('schemaVersion',1,'auditId',audit_id,
    'organizationId',NEW.organization_id,
    'actor',jsonb_build_object('type','human','userId',NEW.actor_user_id,'membershipId',actor_member),
    'action','workspace.module.configured',
    'target',jsonb_build_object('type','workspace_module','id',NEW.organization_id||':'||NEW.module_key),
    'afterRef',audit_id||':after','requestId',request_id,'occurredAt',to_char(NEW.created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  IF before_state IS NOT NULL THEN envelope:=envelope||jsonb_build_object('beforeRef',audit_id||':before'); END IF;
  INSERT INTO public.identity_audit_events
    (id,organization_id,actor_user_id,actor_membership_id,action,target_type,target_id,
      request_id,before_state,after_state,envelope,occurred_at)
    VALUES(audit_id,NEW.organization_id,NEW.actor_user_id,actor_member,
      'workspace.module.configured','workspace_module',NEW.organization_id||':'||NEW.module_key,
      request_id,before_state,after_state,envelope,NEW.created_at);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.audit_workspace_module_revision() FROM PUBLIC;
CREATE TRIGGER workspace_module_revision_audit AFTER INSERT ON public.workspace_module_revisions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.audit_workspace_module_revision();

CREATE FUNCTION company_human_private.reject_workspace_module_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Workspace module history is immutable'; END $$;
REVOKE ALL ON FUNCTION company_human_private.reject_workspace_module_rewrite() FROM PUBLIC;
CREATE TRIGGER workspace_module_immutable BEFORE UPDATE OR DELETE ON public.workspace_module_revisions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_workspace_module_rewrite();
