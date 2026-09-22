-- Keep the private recovery helper idempotent without suppressing new status-transition denials.
GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
SET LOCAL ROLE company_human_policy_denial;
CREATE OR REPLACE FUNCTION company_human_private.block_inactive_organization_members(org text,prior_status text,historical boolean)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_status text; mapping record; revision integer; command_id text; audit_id text;
 request_id text; happened timestamptz; source jsonb; changed integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('organization-access:'||org,0));
 SELECT status INTO current_status FROM public.organizations WHERE id=org;
 IF current_status NOT IN('suspended','closed') THEN RETURN 0; END IF;
 FOR mapping IN SELECT id FROM public.product_memberships
   WHERE organization_id=org AND desired_enabled AND external_member_id IS NOT NULL
     AND (NOT historical OR NOT policy_blocked) ORDER BY id FOR UPDATE
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
RESET ROLE;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
