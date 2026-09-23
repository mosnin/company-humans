-- The restricted bootstrap worker rechecks role authorization before a
-- provider call and before accepting its receipt. Expose only its tenant
-- scoped wrapper; the shared SECURITY DEFINER predicate itself accepts an
-- arbitrary organization and must remain unavailable to runtime logins.
GRANT SELECT (role_id) ON public.memberships TO company_human_bootstrap_worker;
REVOKE EXECUTE ON FUNCTION company_human_private.missing_product_permission(text,text,text)
  FROM company_human_bootstrap_worker;

GRANT CREATE ON SCHEMA company_human_private TO company_human_member_binding;
SET LOCAL ROLE company_human_member_binding;
CREATE FUNCTION company_human_private.bootstrap_missing_product_permission(org text,role text,product text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NULLIF(current_setting('company_human.organization_id',true),'') IS DISTINCT FROM org THEN
   RAISE EXCEPTION 'Bootstrap authorization tenant mismatch' USING ERRCODE='42501';
 END IF;
 RETURN company_human_private.missing_product_permission(org,role,product);
END $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_member_binding;
REVOKE ALL ON FUNCTION company_human_private.bootstrap_missing_product_permission(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.bootstrap_missing_product_permission(text,text,text)
 TO company_human_bootstrap_worker;
