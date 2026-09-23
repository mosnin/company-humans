-- Reconcile tombstones predating 0049 without changing their identity status or history.
-- Same private service authority as the live trigger; no caller supplies a tenant or actor.
-- Lock order is canonical user, then product mappings. Any future enable path must take
-- the user FOR SHARE BEFORE locking/updating a mapping, and recheck active status.
-- Current application privileges do not authorize re-enabling disabled mappings.
SET LOCAL ROLE company_human_identity_offboarding;
DO $$
DECLARE identity_row record; mapping record; revision integer; command_id text; audit_id text; request_id text; happened timestamptz; state jsonb;
BEGIN
 FOR identity_row IN SELECT id,provider_event_timestamp FROM public.users WHERE status='deleted' ORDER BY id FOR UPDATE
 LOOP
  FOR mapping IN SELECT pm.id,pm.organization_id FROM public.product_memberships pm
   JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
   WHERE m.user_id=identity_row.id AND pm.desired_enabled ORDER BY pm.organization_id,pm.id
  LOOP
   UPDATE public.product_memberships SET desired_enabled=false,desired_revision=desired_revision+1,updated_at=clock_timestamp()
    WHERE id=mapping.id AND organization_id=mapping.organization_id AND desired_enabled RETURNING desired_revision INTO revision;
   IF NOT FOUND THEN CONTINUE; END IF;
   command_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
   INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,
     actor_service_id,source_user_id,source_event_timestamp)
    VALUES(command_id,mapping.organization_id,mapping.id,revision,'suspendMember',mapping.id||':identity-delete:'||identity_row.provider_event_timestamp,
     'identity-offboarding',identity_row.id,identity_row.provider_event_timestamp);
   audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-',''); request_id:=gen_random_uuid()::text; happened:=clock_timestamp();
   state:=jsonb_build_object('desiredEnabled',false,'desiredRevision',revision,'sourceUserId',identity_row.id,
     'sourceEventTimestamp',identity_row.provider_event_timestamp,'commandId',command_id,'reason','historical_identity_tombstone');
   INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
    VALUES(audit_id,mapping.organization_id,'service','identity-offboarding','identity.deleted.product_denied','product_membership',mapping.id,request_id,state,
     jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',mapping.organization_id,
       'actor',jsonb_build_object('type','service','id','identity-offboarding'),'action','identity.deleted.product_denied',
       'target',jsonb_build_object('type','product_membership','id',mapping.id),'afterRef',audit_id||':after','requestId',request_id,
       'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
  END LOOP;
 END LOOP;
END $$;
RESET ROLE;
