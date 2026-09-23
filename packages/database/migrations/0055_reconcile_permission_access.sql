-- Reconcile assignments predating authorization invalidation without changing role truth.
-- Private migration/recovery helper; no application or worker can invoke it.
CREATE FUNCTION company_human_private.reconcile_unauthorized_product_memberships() RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant record; mapping record; revision integer; source jsonb; command_id text;
 audit_id text; request_id text; happened timestamptz; state jsonb; reconciled integer:=0;
BEGIN
 FOR tenant IN SELECT DISTINCT pm.organization_id FROM public.product_memberships pm
  WHERE pm.desired_enabled AND NOT pm.policy_blocked AND pm.external_member_id IS NOT NULL ORDER BY pm.organization_id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||tenant.organization_id,0));
  -- Fresh statement after the same authorization lock used by current role writers.
  FOR mapping IN SELECT pm.id,pm.membership_id,m.role_id FROM public.product_memberships pm
   JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
   WHERE pm.organization_id=tenant.organization_id AND pm.desired_enabled AND NOT pm.policy_blocked AND pm.external_member_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.role_permissions rp WHERE rp.organization_id=m.organization_id
      AND rp.role_id=m.role_id AND rp.permission_key='product.use')
   ORDER BY pm.id FOR UPDATE OF pm
  LOOP
   UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
    WHERE id=mapping.id AND organization_id=tenant.organization_id RETURNING desired_revision INTO revision;
   source:=jsonb_build_object('kind','role_permission','permission','product.use','roleId',mapping.role_id,
    'membershipId',mapping.membership_id,'initiatedByUserId',NULL,'reason','preexisting_authorization_gap');
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
REVOKE ALL ON FUNCTION company_human_private.reconcile_unauthorized_product_memberships() FROM PUBLIC;
GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
ALTER FUNCTION company_human_private.reconcile_unauthorized_product_memberships() OWNER TO company_human_policy_denial;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
SET LOCAL ROLE company_human_policy_denial;
SELECT company_human_private.reconcile_unauthorized_product_memberships();
RESET ROLE;
