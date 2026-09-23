-- Historical team attribution starts when this migration observes an existing
-- active assignment. Earlier starts and gaps cannot be reconstructed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_team_history_writer') THEN
    CREATE ROLE company_human_team_history_writer NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_team_history_writer'
    AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unsafe team history writer role';
  END IF;
END $$;

CREATE TABLE company_human_private.team_assignment_active (
  organization_id text NOT NULL,
  team_id text NOT NULL,
  membership_id text NOT NULL,
  team_role text NOT NULL CHECK (team_role IN ('manager', 'member')),
  started_at timestamptz NOT NULL,
  start_origin text NOT NULL CHECK (start_origin IN ('migration_baseline', 'insert', 'reactivation', 'role_change')),
  PRIMARY KEY (team_id, membership_id)
);
CREATE INDEX team_assignment_active_org_member_idx
  ON company_human_private.team_assignment_active (organization_id, membership_id);

CREATE TABLE company_human_private.team_assignment_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  team_id text NOT NULL,
  membership_id text NOT NULL,
  team_role text NOT NULL CHECK (team_role IN ('manager', 'member')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  start_origin text NOT NULL CHECK (start_origin IN ('migration_baseline', 'insert', 'reactivation', 'role_change')),
  end_reason text NOT NULL CHECK (end_reason IN ('removed', 'role_change', 'deleted')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT team_assignment_history_interval CHECK (started_at < ended_at),
  UNIQUE (team_id, membership_id, started_at)
);
CREATE INDEX team_assignment_history_org_member_interval_idx
  ON company_human_private.team_assignment_history (organization_id, membership_id, started_at, ended_at);
CREATE INDEX team_assignment_history_latest_end_idx
  ON company_human_private.team_assignment_history (team_id, membership_id, ended_at DESC);

REVOKE ALL ON company_human_private.team_assignment_active,
  company_human_private.team_assignment_history FROM PUBLIC;
REVOKE ALL ON SEQUENCE company_human_private.team_assignment_history_id_seq FROM PUBLIC;
GRANT USAGE ON SCHEMA company_human_private TO company_human_team_history_writer;
GRANT SELECT, INSERT, DELETE ON company_human_private.team_assignment_active TO company_human_team_history_writer;
GRANT INSERT ON company_human_private.team_assignment_history TO company_human_team_history_writer;
GRANT SELECT (team_id, membership_id, ended_at)
  ON company_human_private.team_assignment_history TO company_human_team_history_writer;
GRANT USAGE ON SEQUENCE company_human_private.team_assignment_history_id_seq TO company_human_team_history_writer;

-- Historical IDs deliberately remain after an operator removes a tenant or
-- membership. Trigger-only creation copies the canonical row's tenant keys;
-- no runtime role can forge, update, or delete these private records.
CREATE FUNCTION company_human_private.capture_team_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  prior company_human_private.team_assignment_active%ROWTYPE;
  transition_at timestamptz;
  latest_closed_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ended_at IS NULL THEN
      SELECT ended_at INTO latest_closed_at
        FROM company_human_private.team_assignment_history
        WHERE team_id = NEW.team_id AND membership_id = NEW.membership_id
        ORDER BY ended_at DESC LIMIT 1;
      transition_at := clock_timestamp();
      IF latest_closed_at IS NOT NULL THEN
        transition_at := greatest(transition_at, latest_closed_at + interval '1 microsecond');
      END IF;
      INSERT INTO company_human_private.team_assignment_active
        (organization_id, team_id, membership_id, team_role, started_at, start_origin)
      VALUES (NEW.organization_id, NEW.team_id, NEW.membership_id, NEW.team_role, transition_at, 'insert');
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.organization_id, NEW.team_id, NEW.membership_id)
    IS DISTINCT FROM (OLD.organization_id, OLD.team_id, OLD.membership_id) THEN
    RAISE EXCEPTION 'Team assignment identity is immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.ended_at IS NULL THEN
    SELECT * INTO STRICT prior FROM company_human_private.team_assignment_active
      WHERE team_id = OLD.team_id AND membership_id = OLD.membership_id;
    IF prior.organization_id <> OLD.organization_id OR prior.team_role <> OLD.team_role THEN
      RAISE EXCEPTION 'Team assignment history drift' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' OR NEW.ended_at IS NOT NULL OR NEW.team_role <> OLD.team_role THEN
      -- A base-row UPDATE/DELETE holds its row lock before this trigger runs;
      -- consecutive transitions for the same assignment serialize there.
      transition_at := greatest(clock_timestamp(), prior.started_at + interval '1 microsecond');
      INSERT INTO company_human_private.team_assignment_history
        (organization_id, team_id, membership_id, team_role, started_at, ended_at, start_origin, end_reason)
      VALUES (prior.organization_id, prior.team_id, prior.membership_id, prior.team_role,
        prior.started_at, transition_at, prior.start_origin,
        CASE WHEN TG_OP = 'DELETE' THEN 'deleted'
          WHEN NEW.ended_at IS NOT NULL THEN 'removed' ELSE 'role_change' END);
      DELETE FROM company_human_private.team_assignment_active
        WHERE team_id = prior.team_id AND membership_id = prior.membership_id;
      IF TG_OP = 'UPDATE' AND NEW.ended_at IS NULL THEN
        INSERT INTO company_human_private.team_assignment_active
          (organization_id, team_id, membership_id, team_role, started_at, start_origin)
        VALUES (NEW.organization_id, NEW.team_id, NEW.membership_id, NEW.team_role, transition_at, 'role_change');
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.ended_at IS NULL THEN
    SELECT ended_at INTO latest_closed_at
      FROM company_human_private.team_assignment_history
      WHERE team_id = NEW.team_id AND membership_id = NEW.membership_id
      ORDER BY ended_at DESC LIMIT 1;
    transition_at := clock_timestamp();
    IF latest_closed_at IS NOT NULL THEN
      transition_at := greatest(transition_at, latest_closed_at + interval '1 microsecond');
    END IF;
    INSERT INTO company_human_private.team_assignment_active
      (organization_id, team_id, membership_id, team_role, started_at, start_origin)
    VALUES (NEW.organization_id, NEW.team_id, NEW.membership_id, NEW.team_role, transition_at, 'reactivation');
  END IF;
  RETURN NULL;
END;
$$;

-- DDL takes an exclusive lock, so the snapshot and trigger installation cannot
-- miss a concurrent assignment transition.
LOCK TABLE public.team_memberships IN ACCESS EXCLUSIVE MODE;
INSERT INTO company_human_private.team_assignment_active
  (organization_id, team_id, membership_id, team_role, started_at, start_origin)
WITH captured AS MATERIALIZED (SELECT clock_timestamp() AS at)
SELECT tm.organization_id, tm.team_id, tm.membership_id, tm.team_role, captured.at, 'migration_baseline'
FROM public.team_memberships AS tm CROSS JOIN captured WHERE tm.ended_at IS NULL;
CREATE TRIGGER capture_team_assignment_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.team_memberships
  FOR EACH ROW EXECUTE FUNCTION company_human_private.capture_team_assignment();
GRANT CREATE ON SCHEMA company_human_private TO company_human_team_history_writer;
ALTER FUNCTION company_human_private.capture_team_assignment() OWNER TO company_human_team_history_writer;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_team_history_writer;
REVOKE ALL ON FUNCTION company_human_private.capture_team_assignment() FROM PUBLIC;
