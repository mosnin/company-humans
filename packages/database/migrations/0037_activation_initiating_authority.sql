-- Bind privileged activation to the immutable actor on the current attempt.
GRANT SELECT ON public.provisioning_attempts TO company_human_activation;
CREATE POLICY activation_attempt_scope ON public.provisioning_attempts FOR SELECT TO company_human_activation
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
GRANT CREATE ON SCHEMA company_human_private TO company_human_activation;
SET LOCAL ROLE company_human_activation;

CREATE OR REPLACE FUNCTION company_human_private.activate_provisioned_instance(operation_id text, lease uuid, external_id text)
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
  IF NOT EXISTS (SELECT 1 FROM public.provisioning_attempts a
    WHERE a.organization_id=op.organization_id AND a.operation_id=op.id
      AND a.attempt_number=op.attempt_count AND a.lease_token=lease
      AND a.finished_at IS NULL
      AND a.actor_user_id=NULLIF(current_setting('company_human.user_id',true),'')) THEN
    RAISE EXCEPTION 'Provisioning initiating authority mismatch' USING ERRCODE='42501';
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

CREATE OR REPLACE FUNCTION company_human_private.activate_connected_instance(operation_id text,lease uuid,external_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op public.provisioning_operations%ROWTYPE;
DECLARE inst public.product_instances%ROWTYPE;
BEGIN
  IF external_id IS NULL OR length(external_id) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Invalid external organization reference' USING ERRCODE='22023';
  END IF;
  SELECT * INTO op FROM public.provisioning_operations WHERE id=operation_id FOR UPDATE;
  IF NOT FOUND OR NOT company_human_private.has_capability(op.organization_id,'applications.manage') THEN
    RAISE EXCEPTION 'Connection activation denied' USING ERRCODE='42501';
  END IF;
  IF op.operation<>'connectOrganization' OR op.status<>'running' OR op.lease_token IS DISTINCT FROM lease
    OR op.lease_expires_at<=clock_timestamp() OR op.requested_external_organization_id IS DISTINCT FROM external_id THEN
    RAISE EXCEPTION 'Stale or mismatched connection receipt' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provisioning_attempts a
    WHERE a.organization_id=op.organization_id AND a.operation_id=op.id
      AND a.attempt_number=op.attempt_count AND a.lease_token=lease
      AND a.finished_at IS NULL
      AND a.actor_user_id=NULLIF(current_setting('company_human.user_id',true),'')) THEN
    RAISE EXCEPTION 'Provisioning initiating authority mismatch' USING ERRCODE='42501';
  END IF;
  SELECT * INTO inst FROM public.product_instances WHERE id=op.product_instance_id AND organization_id=op.organization_id FOR UPDATE;
  IF NOT FOUND OR NOT inst.desired_enabled OR inst.mode<>'connected' OR inst.provisioning_status<>'pending'
    OR inst.external_organization_id IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM public.products WHERE id=inst.product_id AND catalog_status<>'retired') THEN
    RAISE EXCEPTION 'Connection activation no longer allowed' USING ERRCODE='42501';
  END IF;
  UPDATE public.product_instances SET external_organization_id=external_id,provisioning_status='active',updated_at=now()
    WHERE id=inst.id AND organization_id=inst.organization_id;
END $$;

RESET ROLE;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_activation;
