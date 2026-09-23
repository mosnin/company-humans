-- Only this non-login function owner may project a suspended creation receipt.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_member_binding') THEN
    CREATE ROLE company_human_member_binding NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_member_binding;
GRANT SELECT ON public.member_bootstrap_jobs,public.member_bootstrap_attempts,
  public.product_membership_commands,public.product_memberships,public.product_instances,public.products
  TO company_human_member_binding;
GRANT SELECT (id,organization_id,user_id,status) ON public.memberships TO company_human_member_binding;
GRANT SELECT (id,status) ON public.users,public.organizations TO company_human_member_binding;
-- Row locking needs UPDATE privilege; general workers receive neither grant.
GRANT UPDATE (updated_at) ON public.member_bootstrap_jobs TO company_human_member_binding;
GRANT UPDATE (external_member_id,provider_receipt_reference,provisioning_status,provisioned_at,updated_at)
  ON public.product_memberships TO company_human_member_binding;
ALTER POLICY bootstrap_worker_commands ON public.product_membership_commands TO company_human_bootstrap_worker,company_human_member_binding;
ALTER POLICY bootstrap_worker_mappings ON public.product_memberships TO company_human_bootstrap_worker,company_human_member_binding;
ALTER POLICY bootstrap_worker_instances ON public.product_instances TO company_human_bootstrap_worker,company_human_member_binding;
ALTER POLICY bootstrap_worker_jobs ON public.member_bootstrap_jobs TO company_human_bootstrap_worker,company_human_member_binding;
ALTER POLICY bootstrap_worker_attempts ON public.member_bootstrap_attempts TO company_human_bootstrap_worker,company_human_member_binding;
ALTER POLICY bootstrap_membership_read ON public.memberships TO company_human_bootstrap_worker,company_human_member_binding;
ALTER POLICY bootstrap_org_read ON public.organizations TO company_human_bootstrap_worker,company_human_member_binding;
ALTER POLICY bootstrap_user_read ON public.users TO company_human_bootstrap_worker,company_human_member_binding;
CREATE POLICY member_binding_projection ON public.product_memberships FOR UPDATE TO company_human_member_binding
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND provisioning_status IN ('pending','suspended'))
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND provisioning_status='suspended' AND external_member_id IS NOT NULL
    AND provider_receipt_reference IS NOT NULL AND provisioned_at IS NOT NULL);
GRANT INSERT ON public.identity_audit_events TO company_human_member_binding;
CREATE POLICY member_binding_audit ON public.identity_audit_events FOR INSERT TO company_human_member_binding
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND actor_type='service' AND actor_service_id='member-bootstrap-worker' AND actor_user_id IS NULL
    AND action='product.member_bootstrap.bound' AND target_type='product_membership_command'
    AND EXISTS (SELECT 1 FROM public.product_membership_commands c
      WHERE c.organization_id=identity_audit_events.organization_id AND c.id=identity_audit_events.target_id
      AND c.operation='provisionMember'));

CREATE FUNCTION company_human_private.bind_suspended_product_member(command_id text, lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.member_bootstrap_jobs%ROWTYPE;
DECLARE command public.product_membership_commands%ROWTYPE;
DECLARE attempt public.member_bootstrap_attempts%ROWTYPE;
DECLARE mapping public.product_memberships%ROWTYPE;
DECLARE audit_id text;
DECLARE request_id text;
DECLARE receipt_ref text;
DECLARE bound_at timestamptz;
BEGIN
  SELECT * INTO job FROM public.member_bootstrap_jobs j WHERE j.command_id=bind_suspended_product_member.command_id FOR UPDATE;
  IF NOT FOUND OR job.status<>'running' OR job.lease_token IS DISTINCT FROM lease
    OR job.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'Stale member binding lease' USING ERRCODE='42501';
  END IF;
  SELECT * INTO command FROM public.product_membership_commands c WHERE c.id=job.command_id AND c.organization_id=job.organization_id;
  IF NOT FOUND OR command.operation<>'provisionMember' THEN
    RAISE EXCEPTION 'Member binding denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO attempt FROM public.member_bootstrap_attempts a WHERE a.command_id=job.command_id
    AND a.organization_id=job.organization_id AND a.attempt_number=job.attempt_count AND a.lease_token=lease;
  IF NOT FOUND OR attempt.finished_at IS NULL OR attempt.outcome<>'succeeded' OR attempt.provider_reference IS NULL THEN
    RAISE EXCEPTION 'Suspended member receipt required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO mapping FROM public.product_memberships pm
    WHERE pm.id=command.product_membership_id AND pm.organization_id=command.organization_id FOR UPDATE;
  IF NOT FOUND OR NOT mapping.desired_enabled OR mapping.desired_revision<>command.desired_revision
    OR mapping.provisioning_status NOT IN ('pending','suspended')
    OR (mapping.external_member_id IS NOT NULL AND mapping.external_member_id<>attempt.provider_reference)
    OR NOT EXISTS (SELECT 1 FROM public.memberships m JOIN public.users u ON u.id=m.user_id
      JOIN public.organizations o ON o.id=m.organization_id
      JOIN public.product_instances i ON i.organization_id=m.organization_id AND i.id=mapping.product_instance_id
      JOIN public.products p ON p.id=i.product_id
      WHERE m.id=mapping.membership_id AND m.organization_id=mapping.organization_id
        AND m.status='active' AND u.status='active' AND o.status='active'
        AND i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status<>'retired') THEN
    RETURN false;
  END IF;
  receipt_ref:=job.command_id||':attempt:'||job.attempt_count;
  -- Repeating the same receipt never duplicates a binding audit event.
  IF mapping.external_member_id=attempt.provider_reference AND mapping.provider_receipt_reference=receipt_ref
    AND mapping.provisioning_status='suspended' THEN RETURN true; END IF;
  BEGIN
    UPDATE public.product_memberships SET external_member_id=attempt.provider_reference,
      provider_receipt_reference=receipt_ref,provisioning_status='suspended',
      provisioned_at=coalesce(provisioned_at,attempt.finished_at),updated_at=now()
      WHERE id=mapping.id AND organization_id=mapping.organization_id;
    IF NOT FOUND THEN RETURN false; END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Another canonical membership already owns this provider identity in the instance.
    RETURN false;
  END;
  audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');
  request_id:=gen_random_uuid()::text;
  bound_at:=clock_timestamp();
  INSERT INTO public.identity_audit_events
    (id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
    VALUES (audit_id,mapping.organization_id,'service','member-bootstrap-worker','product.member_bootstrap.bound',
      'product_membership_command',job.command_id,request_id,
      jsonb_build_object('productMembershipId',mapping.id,'provisioningStatus','suspended','attemptNumber',job.attempt_count),
      jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',mapping.organization_id,
        'actor',jsonb_build_object('type','service','id','member-bootstrap-worker'),
        'action','product.member_bootstrap.bound','target',jsonb_build_object('type','product_membership_command','id',job.command_id),
        'afterRef',audit_id||':after','requestId',request_id,
        'occurredAt',to_char(bound_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),bound_at);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.bind_suspended_product_member(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.bind_suspended_product_member(text,uuid) TO company_human_bootstrap_worker;
GRANT CREATE ON SCHEMA company_human_private TO company_human_member_binding;
ALTER FUNCTION company_human_private.bind_suspended_product_member(text,uuid) OWNER TO company_human_member_binding;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_member_binding;
