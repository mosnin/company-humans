-- CH-22: narrow, advisory budget snapshot read boundary.
--
-- This role exposes the source rows needed to build one repeatable-read budget
-- comparison snapshot. It grants neither access nor provider enforcement and
-- must not be used as an application login.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'company_human_budget_snapshot'
  ) THEN
    CREATE ROLE company_human_budget_snapshot
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSIF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'company_human_budget_snapshot'
      AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole
        OR rolinherit)
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS role_record
      ON role_record.oid IN (membership.roleid, membership.member)
    WHERE role_record.rolname = 'company_human_budget_snapshot'
  ) THEN
    RAISE EXCEPTION 'Unsafe preexisting budget snapshot role';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public, company_human_private
  TO company_human_budget_snapshot;
REVOKE CREATE ON SCHEMA public, company_human_private
  FROM company_human_budget_snapshot;
GRANT EXECUTE ON FUNCTION company_human_private.has_capability(text,text)
  TO company_human_budget_snapshot;

-- The policy and revision tables expose every tenant row so the caller can
-- verify complete current coverage before projecting active policies.
REVOKE ALL ON public.budget_policies, public.budget_policy_revisions
  FROM company_human_budget_snapshot;
GRANT SELECT (
  id, organization_id, product_id, meter_key, meter_version, unit,
  window_key, scope_kind, product_instance_id, team_id, membership_id,
  capability_key
) ON public.budget_policies TO company_human_budget_snapshot;
GRANT SELECT (
  organization_id, budget_policy_id, revision, maximum_quantity, action, status
) ON public.budget_policy_revisions TO company_human_budget_snapshot;
CREATE POLICY budget_policies_snapshot_read
  ON public.budget_policies FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
  );
CREATE POLICY budget_policy_revisions_snapshot_read
  ON public.budget_policy_revisions FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
  );

-- Product and meter definitions are global catalog references. The caller
-- still selects one exact product and meter from the tenant policy rows.
REVOKE ALL ON public.products, public.meter_definitions
  FROM company_human_budget_snapshot;
GRANT SELECT (id, catalog_status, catalog_metadata, access_contract_revision)
  ON public.products TO company_human_budget_snapshot;
GRANT SELECT (product_id, meter_key, version, unit, aggregation)
  ON public.meter_definitions TO company_human_budget_snapshot;

-- Current tenant context needed to verify an operation's product instance,
-- membership, team, and product-membership mapping. Provider identities and
-- provider receipt columns are intentionally omitted.
REVOKE ALL ON public.product_instances, public.memberships, public.teams,
  public.team_memberships, public.product_memberships
  FROM company_human_budget_snapshot;
GRANT SELECT (id, organization_id, product_id, desired_enabled, provisioning_status)
  ON public.product_instances TO company_human_budget_snapshot;
GRANT SELECT (id, organization_id, user_id, status)
  ON public.memberships TO company_human_budget_snapshot;
GRANT SELECT (id, organization_id, status)
  ON public.teams TO company_human_budget_snapshot;
GRANT SELECT (organization_id, team_id, membership_id, team_role, ended_at)
  ON public.team_memberships TO company_human_budget_snapshot;
GRANT SELECT (
  id, organization_id, product_instance_id, membership_id, desired_enabled,
  provisioning_status, policy_blocked, access_revision, desired_revision
) ON public.product_memberships TO company_human_budget_snapshot;

CREATE POLICY product_instances_snapshot_read
  ON public.product_instances FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
  );
CREATE POLICY memberships_snapshot_read
  ON public.memberships FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
  );
CREATE POLICY teams_snapshot_read
  ON public.teams FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
  );
CREATE POLICY team_memberships_snapshot_read
  ON public.team_memberships FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
  );
CREATE POLICY product_memberships_snapshot_read
  ON public.product_memberships FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
  );

-- Usage reads are restricted to the immutable projected fields. Quarantined
-- source events become visible only when an immutable release row exists.
REVOKE ALL ON public.usage_events, public.usage_quarantine_releases
  FROM company_human_budget_snapshot;
GRANT SELECT (
  event_id, organization_id, product_id, product_instance_id, environment,
  membership_id, team_id, meter_key, meter_version, quantity, unit,
  occurred_at, reported_at, disposition, capability_key
) ON public.usage_events TO company_human_budget_snapshot;
GRANT SELECT (event_id, organization_id)
  ON public.usage_quarantine_releases TO company_human_budget_snapshot;
CREATE POLICY usage_budget_snapshot_read
  ON public.usage_events FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
    AND (
      disposition = 'accepted'
      OR EXISTS (
        SELECT 1
        FROM public.usage_quarantine_releases AS release
        WHERE release.event_id = usage_events.event_id
          AND release.organization_id = usage_events.organization_id
      )
    )
  );
CREATE POLICY usage_release_budget_snapshot_read
  ON public.usage_quarantine_releases FOR SELECT TO company_human_budget_snapshot
  USING (
    organization_id = NULLIF(current_setting('company_human.organization_id', true), '')
    AND company_human_private.has_capability(organization_id, 'budgets.manage')
    AND company_human_private.has_capability(organization_id, 'usage.read.all')
  );
