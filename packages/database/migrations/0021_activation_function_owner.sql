-- Give the privileged function its own limited owner rather than the migration administrator.
-- This also keeps the ordinary service update guard effective for general mutation credentials.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'company_human_activation') THEN
    CREATE ROLE company_human_activation NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_activation;
GRANT EXECUTE ON FUNCTION company_human_private.has_capability(text,text) TO company_human_activation;
GRANT SELECT ON public.provisioning_operations,public.product_instances,public.products TO company_human_activation;
-- SELECT FOR UPDATE needs UPDATE privilege. Identity fields remain inaccessible.
GRANT UPDATE (updated_at) ON public.provisioning_operations TO company_human_activation;
GRANT UPDATE (external_organization_id,provisioning_status,updated_at) ON public.product_instances TO company_human_activation;
CREATE POLICY activation_operation_scope ON public.provisioning_operations TO company_human_activation
  USING (company_human_private.has_capability(organization_id,'applications.manage'))
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY activation_instance_scope ON public.product_instances TO company_human_activation
  USING (company_human_private.has_capability(organization_id,'applications.manage'))
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage'));
GRANT CREATE ON SCHEMA company_human_private TO company_human_activation;
ALTER FUNCTION company_human_private.activate_provisioned_instance(text,uuid,text) OWNER TO company_human_activation;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_activation;
