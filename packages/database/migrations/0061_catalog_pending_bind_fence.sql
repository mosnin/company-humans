-- A catalog change can commit while a suspended provider identity is being
-- created. Stamp its provision intent, then reconcile the exact mapping at bind.
ALTER TABLE public.products ADD COLUMN access_contract_revision bigint NOT NULL DEFAULT 0
 CHECK(access_contract_revision>=0 AND access_contract_revision<=9007199254740991);
ALTER TABLE public.product_membership_commands ADD COLUMN catalog_access_revision bigint
 CHECK(catalog_access_revision IS NULL OR catalog_access_revision BETWEEN 0 AND 9007199254740991);

CREATE FUNCTION company_human_private.bump_catalog_access_revision() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.catalog_status IS DISTINCT FROM NEW.catalog_status OR
    company_human_private.catalog_access_fields(OLD.catalog_metadata) IS DISTINCT FROM
    company_human_private.catalog_access_fields(NEW.catalog_metadata) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('product-catalog-access:'||NEW.id,0));
  NEW.access_contract_revision:=OLD.access_contract_revision+1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.bump_catalog_access_revision() FROM PUBLIC;
CREATE TRIGGER catalog_access_revision BEFORE UPDATE OF catalog_status,catalog_metadata ON public.products
 FOR EACH ROW EXECUTE FUNCTION company_human_private.bump_catalog_access_revision();

CREATE FUNCTION company_human_private.stamp_provision_catalog_revision() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE product text; current_revision bigint;
BEGIN
 IF NEW.operation<>'provisionMember' THEN
  IF NEW.catalog_access_revision IS NOT NULL THEN RAISE EXCEPTION 'Catalog revision is only valid for provision intent' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 SELECT i.product_id INTO product FROM public.product_memberships pm
  JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
  WHERE pm.organization_id=NEW.organization_id AND pm.id=NEW.product_membership_id;
 IF product IS NULL THEN RAISE EXCEPTION 'Missing provision product' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('product-catalog-access:'||product,0));
 SELECT p.access_contract_revision INTO current_revision FROM public.products p WHERE p.id=product;
 IF current_revision IS NULL THEN RAISE EXCEPTION 'Missing product access revision' USING ERRCODE='42501'; END IF;
 -- The revision is assigned by the database. The caller cannot claim a newer contract.
 NEW.catalog_access_revision:=current_revision;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.stamp_provision_catalog_revision() FROM PUBLIC;
CREATE TRIGGER provision_catalog_revision BEFORE INSERT ON public.product_membership_commands
 FOR EACH ROW EXECUTE FUNCTION company_human_private.stamp_provision_catalog_revision();

-- Only the restricted binding function can request this one-mapping denial.
CREATE FUNCTION company_human_private.block_stale_catalog_binding(provision_command text,provider_member text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE intent record; revision integer; denial_id text; audit_id text; request_id text; happened timestamptz; source jsonb;
BEGIN
 SELECT c.organization_id,c.product_membership_id,c.catalog_access_revision,c.desired_revision,
  pm.external_member_id,pm.provider_receipt_reference,pm.desired_enabled,pm.policy_blocked,
  i.product_id,p.access_contract_revision
  INTO intent FROM public.product_membership_commands c
  JOIN public.product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
  JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
  JOIN public.products p ON p.id=i.product_id
  WHERE c.id=provision_command AND c.organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
   AND c.operation='provisionMember' FOR UPDATE OF pm;
 IF NOT FOUND OR intent.external_member_id IS DISTINCT FROM provider_member
  OR NOT intent.desired_enabled OR intent.provider_receipt_reference IS NULL THEN
  RAISE EXCEPTION 'Stale catalog binding denied' USING ERRCODE='42501';
 END IF;
 IF intent.catalog_access_revision IS NOT DISTINCT FROM intent.access_contract_revision THEN RETURN false; END IF;
 -- An earlier denial may already cover this provider identity. Its access fence
 -- remains authoritative; a second command would only obscure that history.
 IF intent.policy_blocked THEN RETURN false; END IF;
 UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
  WHERE organization_id=intent.organization_id AND id=intent.product_membership_id
  RETURNING desired_revision INTO revision;
 source:=jsonb_build_object('kind','product_catalog','productId',intent.product_id,'historical',false,
  'reason','stale_provision_catalog_revision','provisionCommandId',provision_command,
  'provisionRevision',intent.catalog_access_revision,'currentRevision',intent.access_contract_revision);
 denial_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
 INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,
  operation,idempotency_key,actor_service_id,source_catalog)
  VALUES(denial_id,intent.organization_id,intent.product_membership_id,revision,'suspendMember',
   intent.product_membership_id||':catalog-bind:'||revision,'catalog-invalidation',source);
 audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');request_id:=gen_random_uuid()::text;happened:=clock_timestamp();
 INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,
  target_id,request_id,after_state,envelope,occurred_at)
  VALUES(audit_id,intent.organization_id,'service','catalog-invalidation','product.catalog.access_blocked',
   'product_membership',intent.product_membership_id,request_id,
   jsonb_build_object('policyBlocked',true,'desiredRevision',revision,'sourceCatalog',source,'commandId',denial_id),
   jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',intent.organization_id,
    'actor',jsonb_build_object('type','service','id','catalog-invalidation'),
    'action','product.catalog.access_blocked','target',jsonb_build_object('type','product_membership','id',intent.product_membership_id),
    'afterRef',audit_id||':after','requestId',request_id,
    'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION company_human_private.block_stale_catalog_binding(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.block_stale_catalog_binding(text,text) TO company_human_member_binding;

-- Keep the existing receipt, identity and tenant checks. Acquire the catalog
-- lock before projecting a binding so both possible commit orders are fenced.
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
BEGIN
 SELECT i.product_id INTO product_id FROM public.product_membership_commands c
  JOIN public.product_memberships pm ON pm.organization_id=c.organization_id AND pm.id=c.product_membership_id
  JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
  WHERE c.id=bind_suspended_product_member.command_id
   AND c.organization_id=NULLIF(current_setting('company_human.organization_id',true),'');
 IF product_id IS NULL THEN RAISE EXCEPTION 'Stale member binding lease' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('product-catalog-access:'||product_id,0));
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
 RETURN true;
END;
$$;

GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
ALTER FUNCTION company_human_private.bump_catalog_access_revision() OWNER TO company_human_policy_denial;
ALTER FUNCTION company_human_private.stamp_provision_catalog_revision() OWNER TO company_human_policy_denial;
ALTER FUNCTION company_human_private.block_stale_catalog_binding(text,text) OWNER TO company_human_policy_denial;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
