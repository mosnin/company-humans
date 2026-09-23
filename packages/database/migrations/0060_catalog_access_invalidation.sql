-- Product access contract changes invalidate bound member access across tenants.
ALTER TABLE public.product_membership_commands ADD COLUMN source_catalog jsonb
 CHECK(source_catalog IS NULL OR COALESCE(operation='suspendMember' AND source_catalog->>'kind'='product_catalog'
   AND length(source_catalog->>'productId')>0 AND jsonb_typeof(source_catalog->'historical')='boolean',false));
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
   AND source_authorization->>'permission'='product.use'
   AND length(source_authorization->>'roleId')>0 AND length(source_authorization->>'membershipId')>0)
 OR(actor_user_id IS NULL AND actor_service_id='organization-access' AND source_user_id IS NULL
   AND source_event_timestamp IS NULL AND source_policy IS NULL AND source_authorization IS NULL AND source_catalog IS NULL
   AND operation='suspendMember' AND source_workspace IS NOT NULL)
 OR(actor_user_id IS NULL AND actor_service_id='catalog-invalidation' AND source_user_id IS NULL
   AND source_event_timestamp IS NULL AND source_policy IS NULL AND source_authorization IS NULL AND source_workspace IS NULL
   AND operation='suspendMember' AND source_catalog IS NOT NULL),false));
CREATE POLICY catalog_command_provenance ON public.product_membership_commands AS RESTRICTIVE FOR INSERT TO company_human_service
 WITH CHECK(source_catalog IS NULL);
GRANT SELECT ON public.products TO company_human_policy_denial;
DROP POLICY policy_denial_commands ON public.product_membership_commands;
CREATE POLICY policy_denial_commands ON public.product_membership_commands TO company_human_policy_denial USING(true)
 WITH CHECK(operation='suspendMember' AND (
  (actor_user_id IS NOT NULL AND actor_service_id IS NULL AND source_policy IS NOT NULL
   AND source_authorization IS NULL AND source_workspace IS NULL AND source_catalog IS NULL)
  OR(actor_user_id IS NULL AND actor_service_id='authorization-revocation' AND source_authorization IS NOT NULL
   AND source_policy IS NULL AND source_workspace IS NULL AND source_catalog IS NULL)
  OR(actor_user_id IS NULL AND actor_service_id='organization-access' AND source_workspace IS NOT NULL
   AND source_policy IS NULL AND source_authorization IS NULL AND source_catalog IS NULL)
  OR(actor_user_id IS NULL AND actor_service_id='catalog-invalidation' AND source_catalog IS NOT NULL
   AND source_policy IS NULL AND source_authorization IS NULL AND source_workspace IS NULL)));
CREATE POLICY catalog_denial_audit ON public.identity_audit_events FOR INSERT TO company_human_policy_denial
 WITH CHECK(actor_type='service' AND actor_user_id IS NULL AND actor_service_id='catalog-invalidation'
  AND action='product.catalog.access_blocked' AND target_type='product_membership');

CREATE FUNCTION company_human_private.catalog_access_fields(meta jsonb) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('supportedCapabilities',meta->'supportedCapabilities','usageMeters',meta->'usageMeters',
  'requiredPermissions',meta->'requiredPermissions','adapterVersion',meta->'adapterVersion',
  'provisioningModes',meta->'provisioningModes','billingBehavior',meta->'billingBehavior',
  'supportedMemberOperations',meta->'supportedMemberOperations','connectionRequirements',meta->'connectionRequirements')
$$;
REVOKE ALL ON FUNCTION company_human_private.catalog_access_fields(jsonb) FROM PUBLIC;
CREATE FUNCTION company_human_private.block_catalog_members(product text,source jsonb,historical boolean)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_status text; mapping record; revision integer; command_id text; audit_id text;
 request_id text; happened timestamptz; provenance jsonb; changed integer:=0;
BEGIN
 SELECT catalog_status INTO current_status FROM public.products WHERE id=product;
 IF historical AND current_status='ready' THEN RETURN 0; END IF;
 FOR mapping IN SELECT pm.id,pm.organization_id FROM public.product_memberships pm
   JOIN public.product_instances i ON i.organization_id=pm.organization_id AND i.id=pm.product_instance_id
   WHERE i.product_id=product AND pm.desired_enabled AND pm.external_member_id IS NOT NULL
     AND (NOT historical OR NOT pm.policy_blocked) ORDER BY pm.organization_id,pm.id FOR UPDATE OF pm
 LOOP
  UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
   WHERE organization_id=mapping.organization_id AND id=mapping.id RETURNING desired_revision INTO revision;
  provenance:=source||jsonb_build_object('kind','product_catalog','productId',product,'historical',historical);
  command_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,
    actor_service_id,source_catalog)
   VALUES(command_id,mapping.organization_id,mapping.id,revision,'suspendMember',mapping.id||':catalog:'||revision,'catalog-invalidation',provenance);
  audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');request_id:=gen_random_uuid()::text;happened:=clock_timestamp();
  INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
   VALUES(audit_id,mapping.organization_id,'service','catalog-invalidation','product.catalog.access_blocked','product_membership',mapping.id,request_id,
    jsonb_build_object('policyBlocked',true,'desiredRevision',revision,'sourceCatalog',provenance,'commandId',command_id),
    jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',mapping.organization_id,
      'actor',jsonb_build_object('type','service','id','catalog-invalidation'),'action','product.catalog.access_blocked',
      'target',jsonb_build_object('type','product_membership','id',mapping.id),'afterRef',audit_id||':after','requestId',request_id,
      'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
  changed:=changed+1;
 END LOOP;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION company_human_private.block_catalog_members(text,jsonb,boolean) FROM PUBLIC;
CREATE FUNCTION company_human_private.catalog_access_changed() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE before_fields jsonb; after_fields jsonb; source jsonb;
BEGIN
 before_fields:=company_human_private.catalog_access_fields(OLD.catalog_metadata);
 after_fields:=company_human_private.catalog_access_fields(NEW.catalog_metadata);
 IF OLD.catalog_status IS NOT DISTINCT FROM NEW.catalog_status AND before_fields IS NOT DISTINCT FROM after_fields THEN RETURN NEW; END IF;
 source:=jsonb_build_object('previousStatus',OLD.catalog_status,'status',NEW.catalog_status,
  'beforeAccess',before_fields,'afterAccess',after_fields);
 PERFORM company_human_private.block_catalog_members(NEW.id,source,false);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.catalog_access_changed() FROM PUBLIC;
CREATE TRIGGER catalog_access_denial AFTER UPDATE OF catalog_status,catalog_metadata ON public.products
 FOR EACH ROW EXECUTE FUNCTION company_human_private.catalog_access_changed();
GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
ALTER FUNCTION company_human_private.catalog_access_fields(jsonb) OWNER TO company_human_policy_denial;
ALTER FUNCTION company_human_private.block_catalog_members(text,jsonb,boolean) OWNER TO company_human_policy_denial;
ALTER FUNCTION company_human_private.catalog_access_changed() OWNER TO company_human_policy_denial;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
-- Retired or draft products with historical bound access are recovered once.
SET LOCAL ROLE company_human_policy_denial;
SELECT company_human_private.block_catalog_members(id,jsonb_build_object('status',catalog_status,'reason','preexisting_catalog_state'),true)
 FROM public.products WHERE catalog_status<>'ready';
RESET ROLE;
