-- An inactive sponsoring organization must create durable member denial intent.
ALTER TABLE public.product_membership_commands ADD COLUMN source_workspace jsonb
 CHECK(source_workspace IS NULL OR (operation='suspendMember' AND source_workspace->>'kind'='organization_status'
   AND source_workspace->>'organizationId'=organization_id
   AND source_workspace->>'status' IN('suspended','closed')));
ALTER TABLE public.product_membership_commands DROP CONSTRAINT membership_command_actor;
ALTER TABLE public.product_membership_commands ADD CONSTRAINT membership_command_actor CHECK(COALESCE(
 (actor_user_id IS NOT NULL AND actor_service_id IS NULL AND source_user_id IS NULL AND source_event_timestamp IS NULL
   AND source_authorization IS NULL AND source_workspace IS NULL)
 OR(actor_user_id IS NULL AND actor_service_id='identity-offboarding' AND source_user_id IS NOT NULL
   AND source_event_timestamp IS NOT NULL AND source_event_timestamp>=0 AND operation='suspendMember'
   AND source_authorization IS NULL AND source_workspace IS NULL)
 OR(actor_user_id IS NULL AND actor_service_id='authorization-revocation' AND source_user_id IS NULL AND source_event_timestamp IS NULL
   AND operation='suspendMember' AND source_policy IS NULL AND source_workspace IS NULL
   AND jsonb_typeof(source_authorization)='object' AND source_authorization->>'kind' IN('role_permission','membership_role')
   AND source_authorization->>'permission'='product.use'
   AND length(source_authorization->>'roleId')>0 AND length(source_authorization->>'membershipId')>0)
 OR(actor_user_id IS NULL AND actor_service_id='organization-access' AND source_user_id IS NULL
   AND source_event_timestamp IS NULL AND source_policy IS NULL AND source_authorization IS NULL
   AND operation='suspendMember' AND source_workspace IS NOT NULL),false));
CREATE POLICY organization_access_command_provenance ON public.product_membership_commands AS RESTRICTIVE FOR INSERT TO company_human_service
 WITH CHECK(source_workspace IS NULL);
GRANT SELECT ON public.organizations TO company_human_policy_denial;
CREATE POLICY organization_access_owner_read ON public.organizations FOR SELECT TO company_human_policy_denial USING(true);
DROP POLICY policy_denial_commands ON public.product_membership_commands;
CREATE POLICY policy_denial_commands ON public.product_membership_commands TO company_human_policy_denial USING(true)
 WITH CHECK(operation='suspendMember' AND (
  (actor_user_id IS NOT NULL AND actor_service_id IS NULL AND source_policy IS NOT NULL
   AND source_authorization IS NULL AND source_workspace IS NULL)
  OR(actor_user_id IS NULL AND actor_service_id='authorization-revocation' AND source_authorization IS NOT NULL
   AND source_policy IS NULL AND source_workspace IS NULL)
  OR(actor_user_id IS NULL AND actor_service_id='organization-access' AND source_workspace IS NOT NULL
   AND source_policy IS NULL AND source_authorization IS NULL)));
CREATE POLICY organization_access_owner_audit ON public.identity_audit_events FOR INSERT TO company_human_policy_denial
 WITH CHECK(actor_type='service' AND actor_user_id IS NULL AND actor_service_id='organization-access'
  AND action='organization.access_blocked' AND target_type='product_membership');

CREATE FUNCTION company_human_private.block_inactive_organization_members(org text,prior_status text,historical boolean)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_status text; mapping record; revision integer; command_id text; audit_id text;
 request_id text; happened timestamptz; source jsonb; changed integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('organization-access:'||org,0));
 SELECT status INTO current_status FROM public.organizations WHERE id=org;
 IF current_status NOT IN('suspended','closed') THEN RETURN 0; END IF;
 FOR mapping IN SELECT id FROM public.product_memberships
   WHERE organization_id=org AND desired_enabled AND external_member_id IS NOT NULL ORDER BY id FOR UPDATE
 LOOP
  UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
   WHERE organization_id=org AND id=mapping.id RETURNING desired_revision INTO revision;
  source:=jsonb_build_object('kind','organization_status','organizationId',org,'previousStatus',prior_status,
    'status',current_status,'historical',historical);
  command_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,
    actor_service_id,source_workspace)
   VALUES(command_id,org,mapping.id,revision,'suspendMember',mapping.id||':organization-status:'||revision,'organization-access',source);
  audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');request_id:=gen_random_uuid()::text;happened:=clock_timestamp();
  INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
   VALUES(audit_id,org,'service','organization-access','organization.access_blocked','product_membership',mapping.id,request_id,
    jsonb_build_object('policyBlocked',true,'desiredRevision',revision,'sourceWorkspace',source,'commandId',command_id),
    jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',org,
      'actor',jsonb_build_object('type','service','id','organization-access'),'action','organization.access_blocked',
      'target',jsonb_build_object('type','product_membership','id',mapping.id),'afterRef',audit_id||':after','requestId',request_id,
      'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
  changed:=changed+1;
 END LOOP;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION company_human_private.block_inactive_organization_members(text,text,boolean) FROM PUBLIC;
CREATE FUNCTION company_human_private.organization_access_status_changed() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.status='active' AND NEW.status IN('suspended','closed') THEN
  PERFORM company_human_private.block_inactive_organization_members(NEW.id,OLD.status,false);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.organization_access_status_changed() FROM PUBLIC;
CREATE TRIGGER organization_access_denial AFTER UPDATE OF status ON public.organizations
 FOR EACH ROW EXECUTE FUNCTION company_human_private.organization_access_status_changed();
GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
ALTER FUNCTION company_human_private.block_inactive_organization_members(text,text,boolean) OWNER TO company_human_policy_denial;
ALTER FUNCTION company_human_private.organization_access_status_changed() OWNER TO company_human_policy_denial;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
-- Migration-only recovery of bound assignments predating this trigger.
SET LOCAL ROLE company_human_policy_denial;
SELECT company_human_private.block_inactive_organization_members(id,'preexisting',true)
 FROM public.organizations WHERE status IN('suspended','closed');
RESET ROLE;
