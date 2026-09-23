DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'company_human_provisioner') THEN
    CREATE ROLE company_human_provisioner NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public, company_human_private TO company_human_provisioner;
GRANT EXECUTE ON FUNCTION company_human_private.has_capability(text,text) TO company_human_provisioner;
GRANT SELECT ON public.product_instances, public.products TO company_human_provisioner;
GRANT SELECT,INSERT ON public.provisioning_operations,public.provisioning_attempts TO company_human_provisioner;
GRANT UPDATE (status,attempt_count,lease_token,lease_expires_at,next_attempt_at,failure_code,provider_reference,updated_at)
  ON public.provisioning_operations TO company_human_provisioner;
GRANT UPDATE (finished_at,outcome,failure_code,provider_reference) ON public.provisioning_attempts TO company_human_provisioner;
ALTER POLICY provisioning_operations_admin ON public.provisioning_operations TO company_human_service,company_human_provisioner;
ALTER POLICY provisioning_attempts_admin ON public.provisioning_attempts TO company_human_service,company_human_provisioner;
CREATE POLICY provisioner_instance_read ON public.product_instances FOR SELECT TO company_human_provisioner
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
GRANT INSERT ON public.identity_audit_events TO company_human_provisioner;
CREATE POLICY provisioner_audit_insert ON public.identity_audit_events FOR INSERT TO company_human_provisioner
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage')
    AND actor_user_id = NULLIF(current_setting('company_human.user_id',true),'')
    AND target_type = 'provisioning_operation'
    AND action IN ('product.provisioning.claimed','product.provisioning.received','product.provisioning.exhausted'));

-- No general UPDATE grant on product_instances. Only the provisioner may invoke this boundary.
CREATE FUNCTION company_human_private.activate_provisioned_instance(operation_id text, lease uuid, external_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE op public.provisioning_operations%ROWTYPE;
DECLARE inst public.product_instances%ROWTYPE;
BEGIN
  IF external_id IS NULL OR length(external_id) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Invalid external organization reference' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO op FROM public.provisioning_operations WHERE id = operation_id FOR UPDATE;
  IF NOT FOUND OR NOT company_human_private.has_capability(op.organization_id,'applications.manage') THEN
    RAISE EXCEPTION 'Provisioning activation denied' USING ERRCODE = '42501';
  END IF;
  IF op.operation <> 'provisionOrganization' OR op.status <> 'running' OR op.lease_token IS DISTINCT FROM lease
    OR op.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Stale provisioning lease' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO inst FROM public.product_instances
    WHERE id = op.product_instance_id AND organization_id = op.organization_id FOR UPDATE;
  IF NOT FOUND OR NOT inst.desired_enabled OR inst.mode <> 'provisioned' OR inst.provisioning_status <> 'pending'
    OR inst.external_organization_id IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = inst.product_id AND catalog_status <> 'retired') THEN
    RAISE EXCEPTION 'Provisioning activation no longer allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.product_instances SET external_organization_id = external_id, provisioning_status = 'active',updated_at = now()
    WHERE id = inst.id AND organization_id = inst.organization_id;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.activate_provisioned_instance(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.activate_provisioned_instance(text,uuid,text) TO company_human_provisioner;
