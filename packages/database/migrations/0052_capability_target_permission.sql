-- Background capability readers evaluate the target member's stored role grants,
-- without changing their audit actor or impersonating the target user context.
GRANT SELECT(role_id) ON public.memberships TO company_human_capability_preparer,company_human_capability_worker;
GRANT SELECT ON public.role_permissions TO company_human_capability_preparer,company_human_capability_worker;
CREATE POLICY capability_target_role_permissions ON public.role_permissions FOR SELECT
 TO company_human_capability_preparer,company_human_capability_worker
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
