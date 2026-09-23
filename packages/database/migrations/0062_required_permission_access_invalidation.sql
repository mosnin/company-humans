-- A catalog product may require several role permissions. Revocation and late
-- provider binding must use the same tenant-scoped, fail-closed predicate.
ALTER TABLE public.product_membership_commands DROP CONSTRAINT membership_command_actor;
ALTER TABLE public.product_membership_commands ADD CONSTRAINT membership_command_actor CHECK(COALESCE(
 (actor_user_id IS NOT NULL AND actor_service_id IS NULL AND source_user_id IS NULL AND source_event_timestamp IS NULL
   AND source_authorization IS NULL AND source_workspace IS NULL AND source_catalog IS NULL)
 OR(actor_user_id IS NULL AND actor_service_id='identity-offboarding' AND source_user_id IS NOT NULL
   AND source_event_timestamp IS NOT NULL AND source_event_timestamp>=0 AND operation='suspendMember'
   AND source_authorization IS NULL AND source_workspace IS NULL AND source_catalog IS NULL)
 OR(actor_user_id IS NULL AND actor_service_id='authorization-revocation' AND source_user_id IS NULL AND source_event_timestamp IS NULL
   AND operation='suspendMember' AND source_policy IS NULL AND source_workspace IS NULL AND source_catalog IS NULL
   AND jsonb_typeof(source_authorization)='object' AND source_authorization->>'kind' IN('role_permission','membership_role')
   AND source_authorization->>'permission' ~ '^[a-z][a-z0-9._-]*$'
   AND length(source_authorization->>'roleId')>0 AND length(source_authorization->>'membershipId')>0)
 OR(actor_user_id IS NULL AND actor_service_id='organization-access' AND source_user_id IS NULL
   AND source_event_timestamp IS NULL AND source_policy IS NULL AND source_authorization IS NULL AND source_catalog IS NULL
   AND operation='suspendMember' AND source_workspace IS NOT NULL)
 OR(actor_user_id IS NULL AND actor_service_id='catalog-invalidation' AND source_user_id IS NULL
   AND source_event_timestamp IS NULL AND source_policy IS NULL AND source_authorization IS NULL AND source_workspace IS NULL
   AND operation='suspendMember' AND source_catalog IS NOT NULL),false));
GRANT SELECT ON public.permissions TO company_human_policy_denial;

-- A privileged SQL update can move a grant between roles or organizations.
-- Lock both tenant authorization streams in a stable order so the OLD grant
-- cannot disappear while its pending provider binding observes stale truth.
CREATE OR REPLACE FUNCTION company_human_private.lock_product_authorization() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE first_org text; second_org text;
BEGIN
 IF TG_OP='INSERT' THEN first_org:=NEW.organization_id;
 ELSIF TG_OP='DELETE' THEN first_org:=OLD.organization_id;
 ELSE
  first_org:=LEAST(OLD.organization_id,NEW.organization_id);
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
   second_org:=GREATEST(OLD.organization_id,NEW.organization_id);
  END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||first_org,0));
 IF second_org IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||second_org,0));
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION company_human_private.missing_product_permission(org text,role text,product text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE meta jsonb; requirement text;
BEGIN
 SELECT p.catalog_metadata INTO meta FROM public.products p WHERE p.id=product;
 IF NOT FOUND OR jsonb_typeof(meta) IS DISTINCT FROM 'object'
   OR jsonb_typeof(meta->'requiredPermissions') IS DISTINCT FROM 'array' THEN
   RETURN 'catalog.invalid';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(meta->'requiredPermissions') AS element(value)
   WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR value#>>'{}' !~ '^[a-z][a-z0-9._-]*$'
     OR NOT EXISTS(SELECT 1 FROM public.permissions known WHERE known.key=value#>>'{}')) THEN
   RETURN 'catalog.invalid';
 END IF;
 SELECT required.permission INTO requirement FROM (
   SELECT 'product.use'::text permission
   UNION SELECT value#>>'{}' FROM jsonb_array_elements(meta->'requiredPermissions') AS element(value)
 ) required WHERE NOT EXISTS(SELECT 1 FROM public.role_permissions rp
   WHERE rp.organization_id=org AND rp.role_id=role AND rp.permission_key=required.permission)
 ORDER BY required.permission LIMIT 1;
 RETURN requirement;
END $$;
REVOKE ALL ON FUNCTION company_human_private.missing_product_permission(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.missing_product_permission(text,text,text)
 TO company_human_member_binding;

GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
SET LOCAL ROLE company_human_policy_denial;
CREATE OR REPLACE FUNCTION company_human_private.block_changed_product_authorization() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org text; target_role text; target_member text; kind text; mapping record; revision integer;
 command_id text; audit_id text; request_id text; happened timestamptz; state jsonb; source jsonb;
BEGIN
 IF TG_TABLE_NAME='role_permissions' THEN
  org:=OLD.organization_id;target_role:=OLD.role_id;kind:='role_permission';
 ELSE
  IF NEW.role_id=OLD.role_id THEN RETURN NEW; END IF;
  org:=NEW.organization_id;target_role:=NEW.role_id;target_member:=NEW.id;kind:='membership_role';
 END IF;
 -- The BEFORE trigger acquired the tenant authorization lock. Read current
 -- role and catalog truth after that lock, then lock each mapping once.
 FOR mapping IN SELECT pm.id,pm.membership_id,i.product_id,
    company_human_private.missing_product_permission(org,target_role,i.product_id) missing_permission
   FROM public.product_memberships pm
   JOIN public.memberships m ON m.id=pm.membership_id AND m.organization_id=pm.organization_id
   JOIN public.product_instances i ON i.id=pm.product_instance_id AND i.organization_id=pm.organization_id
   WHERE pm.organization_id=org AND m.role_id=target_role
     AND (target_member IS NULL OR m.id=target_member)
     AND pm.desired_enabled AND pm.external_member_id IS NOT NULL
   ORDER BY pm.id FOR UPDATE OF pm
 LOOP
  IF mapping.missing_permission IS NULL THEN CONTINUE; END IF;
  -- A single role-policy edit can remove several required grants in one SQL
  -- statement. The first denial fences the mapping for the whole transaction.
  IF EXISTS(SELECT 1 FROM public.product_membership_commands previous
    WHERE previous.organization_id=org AND previous.product_membership_id=mapping.id
      AND previous.actor_service_id='authorization-revocation'
      AND previous.source_authorization->>'transactionId'=pg_current_xact_id()::text) THEN
    CONTINUE;
  END IF;
  UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
   WHERE organization_id=org AND id=mapping.id RETURNING desired_revision INTO revision;
  source:=jsonb_build_object('kind',kind,'permission',mapping.missing_permission,'roleId',target_role,
    'membershipId',mapping.membership_id,'productId',mapping.product_id,
    'initiatedByUserId',NULLIF(current_setting('company_human.user_id',true),''),
    'transactionId',pg_current_xact_id()::text);
  IF kind='membership_role' THEN source:=source||jsonb_build_object('previousRoleId',OLD.role_id); END IF;
  command_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_service_id,source_authorization)
   VALUES(command_id,org,mapping.id,revision,'suspendMember',mapping.id||':authorization:'||revision,'authorization-revocation',source);
  audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');request_id:=gen_random_uuid()::text;happened:=clock_timestamp();
  state:=jsonb_build_object('policyBlocked',true,'desiredRevision',revision,'sourceAuthorization',source,'commandId',command_id);
  INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
   VALUES(audit_id,org,'service','authorization-revocation','product.authorization.access_blocked','product_membership',mapping.id,request_id,state,
    jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',org,
     'actor',jsonb_build_object('type','service','id','authorization-revocation'),'action','product.authorization.access_blocked',
     'target',jsonb_build_object('type','product_membership','id',mapping.id),'afterRef',audit_id||':after','requestId',request_id,
     'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION company_human_private.reconcile_unauthorized_product_memberships() RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant record; mapping record; revision integer; source jsonb; command_id text;
 audit_id text; request_id text; happened timestamptz; state jsonb; reconciled integer:=0;
BEGIN
 FOR tenant IN SELECT DISTINCT pm.organization_id FROM public.product_memberships pm
  WHERE pm.desired_enabled AND NOT pm.policy_blocked AND pm.external_member_id IS NOT NULL ORDER BY pm.organization_id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||tenant.organization_id,0));
  FOR mapping IN SELECT pm.id,pm.membership_id,m.role_id,i.product_id,
    company_human_private.missing_product_permission(pm.organization_id,m.role_id,i.product_id) missing_permission
   FROM public.product_memberships pm
   JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
   JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
   WHERE pm.organization_id=tenant.organization_id AND pm.desired_enabled
     AND NOT pm.policy_blocked AND pm.external_member_id IS NOT NULL
   ORDER BY pm.id FOR UPDATE OF pm
  LOOP
   IF mapping.missing_permission IS NULL THEN CONTINUE; END IF;
   UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
    WHERE id=mapping.id AND organization_id=tenant.organization_id RETURNING desired_revision INTO revision;
   source:=jsonb_build_object('kind','role_permission','permission',mapping.missing_permission,'roleId',mapping.role_id,
    'membershipId',mapping.membership_id,'productId',mapping.product_id,
    'initiatedByUserId',NULL,'reason','preexisting_authorization_gap');
   command_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
   INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_service_id,source_authorization)
    VALUES(command_id,tenant.organization_id,mapping.id,revision,'suspendMember',mapping.id||':authorization:'||revision,'authorization-revocation',source);
   audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');request_id:=gen_random_uuid()::text;happened:=clock_timestamp();
   state:=jsonb_build_object('policyBlocked',true,'desiredRevision',revision,'sourceAuthorization',source,'commandId',command_id);
   INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
    VALUES(audit_id,tenant.organization_id,'service','authorization-revocation','product.authorization.access_blocked','product_membership',mapping.id,request_id,state,
     jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',tenant.organization_id,
      'actor',jsonb_build_object('type','service','id','authorization-revocation'),'action','product.authorization.access_blocked',
      'target',jsonb_build_object('type','product_membership','id',mapping.id),'afterRef',audit_id||':after','requestId',request_id,
      'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
   reconciled:=reconciled+1;
  END LOOP;
 END LOOP;
 RETURN reconciled;
END $$;

-- Only the restricted binder can call this provenance-preserving late check.
RESET ROLE;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
CREATE FUNCTION company_human_private.block_missing_authorization_binding(provision_command text,provider_member text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE intent record; missing text; revision integer; denial_id text; audit_id text;
 request_id text; happened timestamptz; source jsonb;
BEGIN
 SELECT c.organization_id,c.product_membership_id,pm.external_member_id,pm.provider_receipt_reference,
  pm.desired_enabled,pm.policy_blocked,pm.membership_id,m.role_id,i.product_id
  INTO intent FROM public.product_membership_commands c
  JOIN public.product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
  JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
  JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
  WHERE c.id=provision_command AND c.organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
   AND c.operation='provisionMember' FOR UPDATE OF pm;
 IF NOT FOUND OR intent.external_member_id IS DISTINCT FROM provider_member
   OR NOT intent.desired_enabled OR intent.provider_receipt_reference IS NULL THEN
  RAISE EXCEPTION 'Stale authorization binding denied' USING ERRCODE='42501';
 END IF;
 IF intent.policy_blocked THEN RETURN false; END IF;
 missing:=company_human_private.missing_product_permission(intent.organization_id,intent.role_id,intent.product_id);
 IF missing IS NULL THEN RETURN false; END IF;
 UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
  WHERE organization_id=intent.organization_id AND id=intent.product_membership_id RETURNING desired_revision INTO revision;
 source:=jsonb_build_object('kind','role_permission','permission',missing,'roleId',intent.role_id,
   'membershipId',intent.membership_id,'productId',intent.product_id,
   'initiatedByUserId',NULL,'reason','missing_permission_at_provider_binding',
   'provisionCommandId',provision_command);
 denial_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
 INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,
  operation,idempotency_key,actor_service_id,source_authorization)
  VALUES(denial_id,intent.organization_id,intent.product_membership_id,revision,'suspendMember',
   intent.product_membership_id||':authorization-bind:'||revision,'authorization-revocation',source);
 audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');request_id:=gen_random_uuid()::text;happened:=clock_timestamp();
 INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,
  target_id,request_id,after_state,envelope,occurred_at)
  VALUES(audit_id,intent.organization_id,'service','authorization-revocation','product.authorization.access_blocked',
   'product_membership',intent.product_membership_id,request_id,
   jsonb_build_object('policyBlocked',true,'desiredRevision',revision,'sourceAuthorization',source,'commandId',denial_id),
   jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',intent.organization_id,
    'actor',jsonb_build_object('type','service','id','authorization-revocation'),
    'action','product.authorization.access_blocked','target',jsonb_build_object('type','product_membership','id',intent.product_membership_id),
    'afterRef',audit_id||':after','requestId',request_id,
    'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION company_human_private.block_missing_authorization_binding(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.block_missing_authorization_binding(text,text)
 TO company_human_member_binding;
-- Lock order: catalog product, tenant authorization, then job and mapping rows.
GRANT CREATE ON SCHEMA company_human_private TO company_human_member_binding;
SET LOCAL ROLE company_human_member_binding;
CREATE OR REPLACE FUNCTION company_human_private.bind_suspended_product_member(command_id text, lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.member_bootstrap_jobs%ROWTYPE;
DECLARE command public.product_membership_commands%ROWTYPE;
DECLARE attempt public.member_bootstrap_attempts%ROWTYPE;
DECLARE mapping public.product_memberships%ROWTYPE;
DECLARE audit_id text;
DECLARE request_id text;
DECLARE receipt_ref text;
DECLARE bound_at timestamptz;
DECLARE product_id text;
DECLARE binding_org text;
BEGIN
 SELECT i.product_id,c.organization_id INTO product_id,binding_org FROM public.product_membership_commands c
  JOIN public.product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
  JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
  WHERE c.id=bind_suspended_product_member.command_id
   AND c.organization_id=NULLIF(current_setting('company_human.organization_id',true),'');
 IF product_id IS NULL THEN RAISE EXCEPTION 'Stale member binding lease' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('product-catalog-access:'||product_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||binding_org,0));
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
       AND i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status='ready') THEN
   RETURN false;
 END IF;
 receipt_ref:=job.command_id||':attempt:'||job.attempt_count;
 IF mapping.external_member_id=attempt.provider_reference AND mapping.provider_receipt_reference=receipt_ref
   AND mapping.provisioning_status='suspended' THEN RETURN true; END IF;
 BEGIN
   UPDATE public.product_memberships SET external_member_id=attempt.provider_reference,
     provider_receipt_reference=receipt_ref,provisioning_status='suspended',
     provisioned_at=coalesce(provisioned_at,attempt.finished_at),updated_at=now()
     WHERE id=mapping.id AND organization_id=mapping.organization_id;
   IF NOT FOUND THEN RETURN false; END IF;
 EXCEPTION WHEN unique_violation THEN RETURN false; END;
 audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');
 request_id:=gen_random_uuid()::text;bound_at:=clock_timestamp();
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
 PERFORM company_human_private.block_stale_catalog_binding(job.command_id,attempt.provider_reference);
 PERFORM company_human_private.block_missing_authorization_binding(job.command_id,attempt.provider_reference);
 RETURN true;
END;
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_member_binding;
GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
ALTER FUNCTION company_human_private.missing_product_permission(text,text,text) OWNER TO company_human_policy_denial;
ALTER FUNCTION company_human_private.block_missing_authorization_binding(text,text) OWNER TO company_human_policy_denial;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
-- Idempotent migration-time recovery of bound assignments that already lack a
-- catalog requirement. This helper remains private to the migration role.
SET LOCAL ROLE company_human_policy_denial;
SELECT company_human_private.reconcile_unauthorized_product_memberships();
RESET ROLE;
