-- Remove projected fields that the advisory budget snapshot does not read.
-- Keep the 0072 role and tenant RLS boundary; this migration only narrows its
-- column-level SELECT privileges.
REVOKE SELECT (access_contract_revision)
  ON public.products FROM company_human_budget_snapshot;
REVOKE SELECT (user_id)
  ON public.memberships FROM company_human_budget_snapshot;
REVOKE SELECT (team_role)
  ON public.team_memberships FROM company_human_budget_snapshot;
REVOKE SELECT (id, access_revision, desired_revision)
  ON public.product_memberships FROM company_human_budget_snapshot;
