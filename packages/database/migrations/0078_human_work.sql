-- CH-29 first native Human Work obligation. Operate retains agent tasks.
-- Manager assignment and contributor-reported completion are separate immutable facts.
CREATE TABLE public.human_assignments (
  id text PRIMARY KEY CHECK (id ~ '^ch_hwrk_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  assignee_membership_id text NOT NULL,
  team_id text,
  created_by_user_id text NOT NULL REFERENCES public.users(id),
  created_by_membership_id text NOT NULL,
  source text NOT NULL DEFAULT 'manager' CHECK (source='manager'),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  objective text NOT NULL CHECK (length(trim(objective)) BETWEEN 1 AND 2000),
  due_at timestamptz,
  priority text NOT NULL CHECK (priority IN ('low','normal','high')),
  expected_outcome text NOT NULL CHECK (length(trim(expected_outcome)) BETWEEN 1 AND 2000),
  evidence_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,assignee_membership_id) REFERENCES public.memberships(organization_id,id),
  FOREIGN KEY (organization_id,created_by_membership_id) REFERENCES public.memberships(organization_id,id),
  FOREIGN KEY (organization_id,team_id) REFERENCES public.teams(organization_id,id)
);
CREATE INDEX human_assignments_assignee_queue ON public.human_assignments
  (organization_id,assignee_membership_id,due_at NULLS LAST,created_at DESC);
CREATE INDEX human_assignments_team_queue ON public.human_assignments
  (organization_id,team_id,due_at NULLS LAST);

CREATE TABLE public.human_assignment_completions (
  id text PRIMARY KEY CHECK (id ~ '^ch_hcmp_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  assignment_id text NOT NULL,
  actor_user_id text NOT NULL REFERENCES public.users(id),
  actor_membership_id text NOT NULL,
  outcome text NOT NULL CHECK (length(trim(outcome)) BETWEEN 1 AND 2000),
  evidence text CHECK (evidence IS NULL OR length(trim(evidence)) BETWEEN 1 AND 4000),
  reported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (assignment_id),
  FOREIGN KEY (organization_id,assignment_id) REFERENCES public.human_assignments(organization_id,id),
  FOREIGN KEY (organization_id,actor_membership_id) REFERENCES public.memberships(organization_id,id)
);
CREATE INDEX human_completions_org_time ON public.human_assignment_completions (organization_id,reported_at DESC);

ALTER TABLE public.human_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.human_assignment_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_assignment_completions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.human_assignments,public.human_assignment_completions FROM PUBLIC;
GRANT SELECT ON public.human_assignments,public.human_assignment_completions TO company_human_app,company_human_service;
GRANT INSERT (id,organization_id,assignee_membership_id,team_id,created_by_user_id,
  created_by_membership_id,title,objective,due_at,priority,expected_outcome,evidence_required)
  ON public.human_assignments TO company_human_service;
GRANT INSERT (id,organization_id,assignment_id,actor_user_id,actor_membership_id,outcome,evidence)
  ON public.human_assignment_completions TO company_human_service;

-- Managers need to observe the Work setting; settings alone grant no access.
CREATE POLICY workspace_module_service_work_read ON public.workspace_module_revisions
  FOR SELECT TO company_human_service
  USING (module_key='work' AND company_human_private.service_scope(organization_id));
CREATE FUNCTION company_human_private.work_module_enabled(org text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT org=NULLIF(current_setting('company_human.organization_id',true),'')
    AND COALESCE((SELECT r.enabled FROM public.workspace_module_revisions r
      WHERE r.organization_id=org AND r.module_key='work'
      ORDER BY r.revision DESC LIMIT 1),true);
$$;
REVOKE ALL ON FUNCTION company_human_private.work_module_enabled(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.work_module_enabled(text)
  TO company_human_app,company_human_service;
GRANT EXECUTE ON FUNCTION company_human_private.has_capability(text,text) TO company_human_app;

-- A service session carries a verified canonical user and tenant. Permission,
-- active identities, active team membership and module state are also checked
-- by the insert trigger, so direct SQL cannot skip the application checks.
CREATE FUNCTION company_human_private.human_assignment_visible(org text, assignee text, team text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT company_human_private.work_module_enabled(org) AND (
    (company_human_private.has_capability(org,'assignments.read.own')
      AND EXISTS(SELECT 1 FROM public.memberships m WHERE m.organization_id=org AND m.id=assignee
        AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'') AND m.status='active'))
    OR company_human_private.has_capability(org,'assignments.read.all')
    OR (team IS NOT NULL AND company_human_private.has_capability(org,'assignments.read.team')
      AND EXISTS(SELECT 1 FROM public.teams t WHERE t.organization_id=org AND t.id=team AND t.status='active')
      AND EXISTS(SELECT 1 FROM public.team_memberships tm
        JOIN public.memberships m ON m.id=tm.membership_id AND m.organization_id=tm.organization_id
        WHERE tm.organization_id=org AND tm.team_id=team AND tm.team_role='manager'
          AND tm.ended_at IS NULL AND m.status='active'
          AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'')))
  );
$$;
REVOKE ALL ON FUNCTION company_human_private.human_assignment_visible(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.human_assignment_visible(text,text,text)
  TO company_human_service;

-- Mutating triggers call a volatile check after their advisory locks. A
-- permission removal committed while the insert waited must be observed.
CREATE FUNCTION company_human_private.human_work_permission(org text, permission text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT org=NULLIF(current_setting('company_human.organization_id',true),'')
    AND EXISTS(SELECT 1 FROM public.memberships m
      JOIN public.users u ON u.id=m.user_id AND u.status='active'
      JOIN public.organizations o ON o.id=m.organization_id AND o.status='active'
      JOIN public.role_permissions rp ON rp.organization_id=m.organization_id AND rp.role_id=m.role_id
      WHERE m.organization_id=org AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'')
        AND m.status='active' AND rp.permission_key=permission);
$$;
REVOKE ALL ON FUNCTION company_human_private.human_work_permission(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.human_work_permission(text,text) TO company_human_service;

-- Team membership and team-status writes take the same organization/team
-- transaction locks as assignment creation. An assignment that passes the
-- post-lock check therefore precedes a concurrent removal or archive commit.
CREATE FUNCTION company_human_private.lock_human_work_team_transition()
RETURNS trigger LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE org text; team text;
BEGIN
  IF TG_OP='DELETE' THEN
    org:=OLD.organization_id;
    IF TG_TABLE_NAME='teams' THEN team:=OLD.id; ELSE team:=OLD.team_id; END IF;
  ELSE
    org:=NEW.organization_id;
    IF TG_TABLE_NAME='teams' THEN team:=NEW.id; ELSE team:=NEW.team_id; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||org,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('organization-access:'||org,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('human-work-team:'||org||':'||team,0));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.lock_human_work_team_transition() FROM PUBLIC;
CREATE TRIGGER human_work_team_membership_lock BEFORE INSERT OR UPDATE OR DELETE ON public.team_memberships
  FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_human_work_team_transition();
CREATE TRIGGER human_work_team_status_lock BEFORE UPDATE OF status ON public.teams
  FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_human_work_team_transition();

CREATE POLICY human_assignment_own_read ON public.human_assignments FOR SELECT TO company_human_app
  USING (company_human_private.work_module_enabled(organization_id)
    AND company_human_private.has_capability(organization_id,'assignments.read.own')
    AND EXISTS(SELECT 1 FROM public.memberships m WHERE m.organization_id=human_assignments.organization_id
      AND m.id=human_assignments.assignee_membership_id AND m.status='active'
      AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'')));
CREATE POLICY human_assignment_service_read ON public.human_assignments FOR SELECT TO company_human_service
  USING (company_human_private.human_assignment_visible(organization_id,assignee_membership_id,team_id));
CREATE POLICY human_assignment_service_insert ON public.human_assignments FOR INSERT TO company_human_service
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND created_by_user_id=NULLIF(current_setting('company_human.user_id',true),''));
CREATE POLICY human_completion_own_read ON public.human_assignment_completions FOR SELECT TO company_human_app
  USING (EXISTS(SELECT 1 FROM public.human_assignments a WHERE a.organization_id=human_assignment_completions.organization_id
    AND a.id=human_assignment_completions.assignment_id));
CREATE POLICY human_completion_service_read ON public.human_assignment_completions FOR SELECT TO company_human_service
  USING (EXISTS(SELECT 1 FROM public.human_assignments a WHERE a.organization_id=human_assignment_completions.organization_id
    AND a.id=human_assignment_completions.assignment_id));
CREATE POLICY human_completion_service_insert ON public.human_assignment_completions FOR INSERT TO company_human_service
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND actor_user_id=NULLIF(current_setting('company_human.user_id',true),''));

CREATE FUNCTION company_human_private.guard_human_assignment()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE actor_member text; target_user text; team_status text; target_in_team boolean; team_authorized boolean;
BEGIN
  IF NEW.organization_id IS DISTINCT FROM NULLIF(current_setting('company_human.organization_id',true),'')
    OR NEW.created_by_user_id IS DISTINCT FROM NULLIF(current_setting('company_human.user_id',true),'') THEN
    RAISE EXCEPTION 'Human assignment denied' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||NEW.organization_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('organization-access:'||NEW.organization_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('product-member-parent:'||NEW.organization_id||':'||NEW.assignee_membership_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-module-revision:'||NEW.organization_id||':work',0));
  IF NOT company_human_private.work_module_enabled(NEW.organization_id) THEN
    RAISE EXCEPTION 'Work module disabled' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO actor_member FROM public.memberships m JOIN public.users u ON u.id=m.user_id
    JOIN public.organizations o ON o.id=m.organization_id
    WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.created_by_user_id
      AND m.status='active' AND u.status='active' AND o.status='active';
  SELECT m.user_id INTO target_user FROM public.memberships m JOIN public.users u ON u.id=m.user_id
    WHERE m.organization_id=NEW.organization_id AND m.id=NEW.assignee_membership_id
      AND m.status='active' AND u.status='active';
  IF actor_member IS NULL OR NEW.created_by_membership_id IS DISTINCT FROM actor_member OR target_user IS NULL THEN
    RAISE EXCEPTION 'Human assignment identities unavailable' USING ERRCODE='42501';
  END IF;
  IF NEW.team_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('human-work-team:'||NEW.organization_id||':'||NEW.team_id,0));
    SELECT t.status INTO team_status FROM public.teams t
      WHERE t.organization_id=NEW.organization_id AND t.id=NEW.team_id;
    SELECT EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.organization_id=NEW.organization_id
      AND tm.team_id=NEW.team_id AND tm.membership_id=NEW.assignee_membership_id
      AND tm.ended_at IS NULL) INTO target_in_team;
    IF team_status IS DISTINCT FROM 'active' OR target_in_team IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Human assignment team unavailable' USING ERRCODE='42501';
    END IF;
  END IF;
  IF company_human_private.human_work_permission(NEW.organization_id,'assignments.manage.all') THEN
    RETURN NEW;
  END IF;
  SELECT NEW.team_id IS NOT NULL
    AND company_human_private.human_work_permission(NEW.organization_id,'assignments.manage.team')
    AND EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.organization_id=NEW.organization_id
      AND tm.team_id=NEW.team_id AND tm.membership_id=actor_member
      AND tm.team_role='manager' AND tm.ended_at IS NULL) INTO team_authorized;
  IF team_authorized IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Human assignment management denied' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_human_assignment() FROM PUBLIC;
CREATE TRIGGER human_assignment_insert_guard BEFORE INSERT ON public.human_assignments
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_human_assignment();

CREATE FUNCTION company_human_private.guard_human_completion()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE assignment public.human_assignments%ROWTYPE; actor_member text;
BEGIN
  IF NEW.organization_id IS DISTINCT FROM NULLIF(current_setting('company_human.organization_id',true),'')
    OR NEW.actor_user_id IS DISTINCT FROM NULLIF(current_setting('company_human.user_id',true),'') THEN
    RAISE EXCEPTION 'Human completion denied' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO actor_member FROM public.memberships m
    WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.actor_user_id;
  IF actor_member IS NULL THEN
    RAISE EXCEPTION 'Human completion actor unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||NEW.organization_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('organization-access:'||NEW.organization_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('product-member-parent:'||NEW.organization_id||':'||actor_member,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-module-revision:'||NEW.organization_id||':work',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('human-completion:'||NEW.assignment_id,0));
  IF NOT company_human_private.work_module_enabled(NEW.organization_id)
    OR NOT company_human_private.human_work_permission(NEW.organization_id,'assignments.read.own') THEN
    RAISE EXCEPTION 'Human completion unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO assignment FROM public.human_assignments a
    WHERE a.organization_id=NEW.organization_id AND a.id=NEW.assignment_id;
  SELECT m.id INTO actor_member FROM public.memberships m JOIN public.users u ON u.id=m.user_id
    WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.actor_user_id
      AND m.status='active' AND u.status='active';
  IF assignment.id IS NULL OR actor_member IS NULL OR actor_member IS DISTINCT FROM assignment.assignee_membership_id
    OR NEW.actor_membership_id IS DISTINCT FROM actor_member
    OR (assignment.evidence_required AND NEW.evidence IS NULL) THEN
    RAISE EXCEPTION 'Human completion actor or evidence denied' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.human_assignment_completions c WHERE c.assignment_id=NEW.assignment_id) THEN
    RAISE EXCEPTION 'Human assignment already reported complete' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.guard_human_completion() FROM PUBLIC;
CREATE TRIGGER human_completion_insert_guard BEFORE INSERT ON public.human_assignment_completions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_human_completion();

CREATE FUNCTION company_human_private.audit_human_work()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE audit_id text; action text; target_type text; target_id text; actor_user text; actor_member text;
  org text; occurred timestamptz; after_state jsonb; envelope jsonb; request_id text;
BEGIN
  audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');
  request_id:=gen_random_uuid()::text;
  IF TG_TABLE_NAME='human_assignments' THEN
    action:='human_assignment.created'; target_type:='human_assignment'; target_id:=NEW.id;
    actor_user:=NEW.created_by_user_id; actor_member:=NEW.created_by_membership_id;
    org:=NEW.organization_id; occurred:=NEW.created_at;
    after_state:=jsonb_build_object('assigneeMembershipId',NEW.assignee_membership_id,
      'teamId',NEW.team_id,'source','manager','title',NEW.title,'objective',NEW.objective,
      'dueAt',NEW.due_at,'priority',NEW.priority,'expectedOutcome',NEW.expected_outcome,
      'evidenceRequired',NEW.evidence_required);
  ELSE
    action:='human_assignment.completion_reported'; target_type:='human_assignment'; target_id:=NEW.assignment_id;
    actor_user:=NEW.actor_user_id; actor_member:=NEW.actor_membership_id;
    org:=NEW.organization_id; occurred:=NEW.reported_at;
    after_state:=jsonb_build_object('completionId',NEW.id,'outcome',NEW.outcome,
      'evidence',NEW.evidence,'reportedAt',NEW.reported_at);
  END IF;
  envelope:=jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',org,
    'actor',jsonb_build_object('type','human','userId',actor_user,'membershipId',actor_member),
    'action',action,'target',jsonb_build_object('type',target_type,'id',target_id),
    'afterRef',audit_id||':after','requestId',request_id,
    'occurredAt',to_char(occurred AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  INSERT INTO public.identity_audit_events
    (id,organization_id,actor_user_id,actor_membership_id,action,target_type,target_id,
      request_id,after_state,envelope,occurred_at)
    VALUES(audit_id,org,actor_user,actor_member,action,target_type,target_id,
      request_id,after_state,envelope,occurred);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.audit_human_work() FROM PUBLIC;
CREATE TRIGGER human_assignment_audit AFTER INSERT ON public.human_assignments
  FOR EACH ROW EXECUTE FUNCTION company_human_private.audit_human_work();
CREATE TRIGGER human_completion_audit AFTER INSERT ON public.human_assignment_completions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.audit_human_work();

CREATE FUNCTION company_human_private.reject_human_work_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Human Work facts are immutable' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION company_human_private.reject_human_work_rewrite() FROM PUBLIC;
CREATE TRIGGER human_assignment_immutable BEFORE UPDATE OR DELETE ON public.human_assignments
  FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_human_work_rewrite();
CREATE TRIGGER human_completion_immutable BEFORE UPDATE OR DELETE ON public.human_assignment_completions
  FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_human_work_rewrite();
