-- Own-assignment RLS from0043 still applies; expose local intent without provider identifiers.
GRANT SELECT(policy_blocked) ON public.product_memberships TO company_human_app;
