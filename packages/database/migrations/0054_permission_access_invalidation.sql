-- Authorization loss enters the existing durable, revision-fenced denial stream.
ALTER TABLE public.product_membership_commands ADD COLUMN source_authorization jsonb;
ALTER TABLE public.product_membership_commands DROP CONSTRAINT membership_command_actor;
ALTER TABLE public.product_membership_commands ADD CONSTRAINT membership_command_actor CHECK(COALESCE(
 (actor_user_id IS NOT NULL AND actor_service_id IS NULL AND source_user_id IS NULL AND source_event_timestamp IS NULL AND source_authorization IS NULL)
 OR(actor_user_id IS NULL AND actor_service_id='identity-offboarding' AND source_user_id IS NOT NULL
  AND source_event_timestamp IS NOT NULL AND source_event_timestamp>=0 AND operation='suspendMember' AND source_authorization IS NULL)
 OR(actor_user_id IS NULL AND actor_service_id='authorization-revocation' AND source_user_id IS NULL AND source_event_timestamp IS NULL
  AND operation='suspendMember' AND source_policy IS NULL AND jsonb_typeof(source_authorization)='object'
  AND source_authorization->>'kind' IN('role_permission','membership_role')
  AND source_authorization->>'permission'='product.use'
  AND length(source_authorization->>'roleId')>0 AND length(source_authorization->>'membershipId')>0),false));
CREATE POLICY authorization_command_provenance ON public.product_membership_commands AS RESTRICTIVE FOR INSERT TO company_human_service
 WITH CHECK(source_authorization IS NULL);
GRANT SELECT ON public.memberships,public.role_permissions TO company_human_policy_denial;
CREATE POLICY authorization_denial_members ON public.memberships FOR SELECT TO company_human_policy_denial USING(true);
CREATE POLICY authorization_denial_permissions ON public.role_permissions FOR SELECT TO company_human_policy_denial USING(true);
DROP POLICY policy_denial_commands ON public.product_membership_commands;
CREATE POLICY policy_denial_commands ON public.product_membership_commands TO company_human_policy_denial USING(true)
 WITH CHECK(operation='suspendMember' AND ((actor_user_id IS NOT NULL AND actor_service_id IS NULL AND source_policy IS NOT NULL AND source_authorization IS NULL)
  OR(actor_user_id IS NULL AND actor_service_id='authorization-revocation' AND source_authorization IS NOT NULL AND source_policy IS NULL)));
CREATE POLICY authorization_denial_audit ON public.identity_audit_events FOR INSERT TO company_human_policy_denial
 WITH CHECK(actor_type='service' AND actor_user_id IS NULL AND actor_service_id='authorization-revocation'
  AND action='product.authorization.access_blocked' AND target_type='product_membership');

-- All permission and membership-role writers share this transaction lock, including direct SQL.
-- Application writers acquire it before row locks; direct concurrent SQL can abort on a
-- deadlock and must retry the whole transaction. A successful commit cannot miss revocation.
CREATE FUNCTION company_human_private.lock_product_authorization() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||COALESCE(NEW.organization_id,OLD.organization_id),0));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.lock_product_authorization() FROM PUBLIC;
CREATE TRIGGER role_product_authorization_lock BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
 FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_product_authorization();
CREATE TRIGGER membership_product_authorization_lock BEFORE INSERT OR UPDATE OF role_key,role_id ON public.memberships
 FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_product_authorization();

CREATE FUNCTION company_human_private.block_changed_product_authorization() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org text; target_role text; target_member text; kind text; mapping record; revision integer;
 command_id text; audit_id text; request_id text; happened timestamptz; state jsonb; source jsonb;
BEGIN
 IF TG_TABLE_NAME='role_permissions' THEN
  IF OLD.permission_key<>'product.use' THEN RETURN OLD; END IF;
  org:=OLD.organization_id;target_role:=OLD.role_id;kind:='role_permission';
 ELSE
  IF NEW.role_id=OLD.role_id THEN RETURN NEW; END IF;
  org:=NEW.organization_id;target_role:=NEW.role_id;target_member:=NEW.id;kind:='membership_role';
 END IF;
 -- Separate statement after acquiring the shared lock: observe committed concurrent edits.
 IF EXISTS(SELECT 1 FROM public.role_permissions WHERE organization_id=org AND role_id=target_role AND permission_key='product.use') THEN
  RETURN NULL;
 END IF;
 FOR mapping IN SELECT pm.id,pm.membership_id FROM public.product_memberships pm
  JOIN public.memberships m ON m.id=pm.membership_id AND m.organization_id=pm.organization_id
  WHERE pm.organization_id=org AND m.role_id=target_role AND (target_member IS NULL OR m.id=target_member)
   AND pm.desired_enabled AND pm.external_member_id IS NOT NULL ORDER BY pm.id FOR UPDATE OF pm
 LOOP
  UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
   WHERE organization_id=org AND id=mapping.id RETURNING desired_revision INTO revision;
  source:=jsonb_build_object('kind',kind,'permission','product.use','roleId',target_role,'membershipId',mapping.membership_id,
    'initiatedByUserId',NULLIF(current_setting('company_human.user_id',true),''));
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
REVOKE ALL ON FUNCTION company_human_private.block_changed_product_authorization() FROM PUBLIC;
CREATE TRIGGER role_permission_product_denial AFTER DELETE OR UPDATE ON public.role_permissions
 FOR EACH ROW EXECUTE FUNCTION company_human_private.block_changed_product_authorization();
CREATE TRIGGER membership_role_product_denial AFTER UPDATE OF role_key,role_id ON public.memberships
 FOR EACH ROW EXECUTE FUNCTION company_human_private.block_changed_product_authorization();
GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
ALTER FUNCTION company_human_private.block_changed_product_authorization() OWNER TO company_human_policy_denial;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
