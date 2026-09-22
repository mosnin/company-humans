-- Capability preparation evaluates the target member's full catalog permission set.
-- The two restricted background readers already see only tenant-scoped role grants.
GRANT SELECT ON public.permissions TO company_human_capability_preparer,company_human_capability_worker;
