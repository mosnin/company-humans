-- Human usage may name a team only when that member belonged to the team at
-- occurrence time. The 0068 cutover is deliberately not backdated.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_usage_team_guard') THEN
    CREATE ROLE company_human_usage_team_guard NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_usage_team_guard'
    AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unsafe usage team guard role';
  END IF;
END $$;

GRANT USAGE ON SCHEMA company_human_private TO company_human_usage_team_guard;
GRANT SELECT (organization_id, team_id, membership_id, started_at)
  ON company_human_private.team_assignment_active TO company_human_usage_team_guard;
-- PostgreSQL requires UPDATE privilege to acquire a row share lock. The role
-- cannot log in and no callable function exposes a write to this column.
GRANT UPDATE (started_at) ON company_human_private.team_assignment_active
  TO company_human_usage_team_guard;
GRANT SELECT (organization_id, team_id, membership_id, started_at, ended_at)
  ON company_human_private.team_assignment_history TO company_human_usage_team_guard;

CREATE FUNCTION company_human_private.assert_usage_team_temporal(
  target_organization text, target_member text, target_team text, target_occurred_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE valid_active boolean;
BEGIN
  IF target_organization IS NULL OR target_member IS NULL OR target_team IS NULL
    OR target_occurred_at IS NULL OR target_occurred_at > clock_timestamp() THEN
    RAISE EXCEPTION 'Usage team attribution is outside a verified assignment'
      USING ERRCODE = 'CHT01', CONSTRAINT = 'usage_team_temporal';
  END IF;

  -- Lock the active interval so a concurrent removal cannot commit between
  -- this check and the usage insertion. A removal that wins the lock is then
  -- visible in the closed history query under READ COMMITTED.
  SELECT true INTO valid_active
    FROM company_human_private.team_assignment_active AS a
    WHERE a.organization_id = target_organization
      AND a.membership_id = target_member AND a.team_id = target_team
      AND a.started_at <= target_occurred_at
    FOR SHARE;
  IF valid_active THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM company_human_private.team_assignment_history AS h
    WHERE h.organization_id = target_organization
      AND h.membership_id = target_member AND h.team_id = target_team
      AND h.started_at <= target_occurred_at AND target_occurred_at < h.ended_at
  ) THEN RETURN; END IF;

  RAISE EXCEPTION 'Usage team attribution is outside a verified assignment'
    USING ERRCODE = 'CHT01', CONSTRAINT = 'usage_team_temporal';
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.assert_usage_team_temporal(text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.assert_usage_team_temporal(text,text,text,timestamptz)
  TO company_human_usage_revalidator;

CREATE FUNCTION company_human_private.guard_usage_team_temporal() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.envelope #>> '{actor,type}' = 'human' AND NEW.team_id IS NOT NULL THEN
    PERFORM company_human_private.assert_usage_team_temporal(
      NEW.organization_id, NEW.membership_id, NEW.team_id, NEW.occurred_at);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.guard_usage_team_temporal() FROM PUBLIC;
CREATE TRIGGER usage_team_temporal_guard BEFORE INSERT ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_usage_team_temporal();
GRANT CREATE ON SCHEMA company_human_private TO company_human_usage_team_guard;
ALTER FUNCTION company_human_private.assert_usage_team_temporal(text,text,text,timestamptz)
  OWNER TO company_human_usage_team_guard;
ALTER FUNCTION company_human_private.guard_usage_team_temporal()
  OWNER TO company_human_usage_team_guard;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_usage_team_guard;

-- The 0047 function is owned by this separate non-login role. Replace it as
-- that owner so hosted migrators do not require superuser privileges.
GRANT CREATE ON SCHEMA company_human_private TO company_human_usage_revalidator;
SET LOCAL ROLE company_human_usage_revalidator;
CREATE OR REPLACE FUNCTION company_human_private.release_usage_quarantine(target_event text, adjustment_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source public.usage_events%ROWTYPE;
BEGIN
 IF adjustment_reason IS NULL OR length(trim(adjustment_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid release reason'; END IF;
 SELECT * INTO source FROM public.usage_events WHERE event_id=target_event;
 IF NOT FOUND OR NOT company_human_private.has_capability(source.organization_id,'budgets.manage') THEN
  RAISE EXCEPTION 'Usage recovery unavailable or denied';
 END IF;
 IF source.disposition <> 'quarantined' THEN RAISE EXCEPTION 'Usage is not quarantined'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.meter_definitions m WHERE m.product_id=source.product_id AND m.meter_key=source.meter_key
    AND m.version=source.meter_version AND m.unit=source.unit) THEN RAISE EXCEPTION 'Exact meter registration required'; END IF;
 IF source.envelope #>> '{actor,type}' = 'human' AND source.team_id IS NOT NULL THEN
  PERFORM company_human_private.assert_usage_team_temporal(
    source.organization_id, source.membership_id, source.team_id, source.occurred_at);
 END IF;
 INSERT INTO public.usage_quarantine_releases(event_id,organization_id,membership_id,team_id,actor_user_id,reason)
 VALUES(source.event_id,source.organization_id,source.membership_id,source.team_id,NULLIF(current_setting('company_human.user_id',true),''),trim(adjustment_reason))
 ON CONFLICT(event_id) DO NOTHING;
 RETURN FOUND;
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_usage_revalidator;
