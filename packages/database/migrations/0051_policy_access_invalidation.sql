-- Policy changes revoke effective access without destroying the desired assignment.
ALTER TABLE public.product_memberships ADD COLUMN policy_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.product_membership_commands ADD COLUMN source_policy jsonb
 CHECK(source_policy IS NULL OR COALESCE(actor_user_id IS NOT NULL AND actor_service_id IS NULL
  AND operation='suspendMember' AND source_policy->>'kind' IN('entitlement','usage_limit')
  AND jsonb_typeof(source_policy->'revision')='number' AND (source_policy->>'revision')::integer>0
  AND length(source_policy->>'id')>0,false));
-- Applications cannot forge a trigger-origin policy command, even when they can deny manually.
CREATE POLICY policy_command_provenance ON public.product_membership_commands AS RESTRICTIVE FOR INSERT TO company_human_service
 WITH CHECK(source_policy IS NULL);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_policy_denial') THEN
  CREATE ROLE company_human_policy_denial NOLOGIN NOSUPERUSER NOBYPASSRLS;
 ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_policy_denial' AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe policy denial owner'; END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_policy_denial;
GRANT SELECT ON public.entitlement_policies,public.product_usage_limits,public.product_memberships,
 public.product_instances,public.product_membership_commands,public.member_access_commands,
 public.member_denial_jobs,public.member_denial_attempts TO company_human_policy_denial;
GRANT UPDATE(policy_blocked,desired_revision,provisioning_status,updated_at) ON public.product_memberships TO company_human_policy_denial;
GRANT UPDATE(updated_at) ON public.member_denial_jobs TO company_human_policy_denial;
GRANT INSERT ON public.product_membership_commands,public.identity_audit_events TO company_human_policy_denial;
CREATE POLICY policy_denial_entitlement ON public.entitlement_policies FOR SELECT TO company_human_policy_denial USING(true);
CREATE POLICY policy_denial_limit ON public.product_usage_limits FOR SELECT TO company_human_policy_denial USING(true);
CREATE POLICY policy_denial_mapping ON public.product_memberships TO company_human_policy_denial USING(true) WITH CHECK(true);
CREATE POLICY policy_denial_instance ON public.product_instances FOR SELECT TO company_human_policy_denial USING(true);
CREATE POLICY policy_denial_commands ON public.product_membership_commands TO company_human_policy_denial USING(true)
 WITH CHECK(actor_user_id IS NOT NULL AND actor_service_id IS NULL AND operation='suspendMember' AND source_policy IS NOT NULL);
CREATE POLICY policy_denial_access ON public.member_access_commands FOR SELECT TO company_human_policy_denial USING(true);
CREATE POLICY policy_denial_jobs ON public.member_denial_jobs TO company_human_policy_denial USING(true) WITH CHECK(true);
CREATE POLICY policy_denial_attempts ON public.member_denial_attempts FOR SELECT TO company_human_policy_denial USING(true);
CREATE POLICY policy_denial_audit ON public.identity_audit_events FOR INSERT TO company_human_policy_denial
 WITH CHECK((actor_type='human' AND actor_user_id IS NOT NULL AND actor_service_id IS NULL
  AND action='product.policy.access_blocked' AND target_type='product_membership')
 OR(actor_type='service' AND actor_user_id IS NULL AND actor_service_id='member-denial-worker'
  AND action='product.member_denial.projected' AND target_type='product_membership_command'));

CREATE FUNCTION company_human_private.block_changed_product_policy() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE instance_id text; member_id text; source jsonb; mapping record; revision integer;
 command_id text; audit_id text; request_id text; happened timestamptz; state jsonb;
BEGIN
 IF TG_TABLE_NAME='entitlement_policy_revisions' THEN
  SELECT product_instance_id,membership_id INTO STRICT instance_id,member_id FROM public.entitlement_policies
   WHERE organization_id=NEW.organization_id AND id=NEW.entitlement_id;
  source:=jsonb_build_object('kind','entitlement','id',NEW.entitlement_id,'revision',NEW.revision);
 ELSE
  SELECT product_instance_id,membership_id INTO STRICT instance_id,member_id FROM public.product_usage_limits
   WHERE organization_id=NEW.organization_id AND id=NEW.usage_limit_id;
  source:=jsonb_build_object('kind','usage_limit','id',NEW.usage_limit_id,'revision',NEW.revision);
 END IF;
 -- Unbound bootstrap is already denied. Do not supersede its only creation intent.
 -- Mapping locks are ordered across all affected members; subsequent activation must lock the
 -- same mapping and recheck current policies before enqueueing a newer grant revision.
 FOR mapping IN SELECT pm.id FROM public.product_memberships pm
  WHERE pm.organization_id=NEW.organization_id AND pm.product_instance_id=instance_id
   AND (member_id IS NULL OR pm.membership_id=member_id)
   AND pm.desired_enabled AND pm.external_member_id IS NOT NULL ORDER BY pm.id FOR UPDATE
 LOOP
  UPDATE public.product_memberships SET policy_blocked=true,desired_revision=desired_revision+1,updated_at=clock_timestamp()
   WHERE id=mapping.id AND organization_id=NEW.organization_id RETURNING desired_revision INTO revision;
  command_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,actor_user_id,source_policy)
   VALUES(command_id,NEW.organization_id,mapping.id,revision,'suspendMember',mapping.id||':policy:'||revision,NEW.actor_user_id,source);
  audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');request_id:=gen_random_uuid()::text;happened:=clock_timestamp();
  state:=jsonb_build_object('policyBlocked',true,'desiredRevision',revision,'sourcePolicy',source,'commandId',command_id);
  INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_user_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
   VALUES(audit_id,NEW.organization_id,'human',NEW.actor_user_id,'product.policy.access_blocked','product_membership',mapping.id,request_id,state,
    jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',NEW.organization_id,
     'actor',jsonb_build_object('type','human','userId',NEW.actor_user_id),'action','product.policy.access_blocked',
     'target',jsonb_build_object('type','product_membership','id',mapping.id),'afterRef',audit_id||':after','requestId',request_id,
     'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.block_changed_product_policy() FROM PUBLIC;
CREATE TRIGGER entitlement_policy_access_denial AFTER INSERT ON public.entitlement_policy_revisions
 FOR EACH ROW EXECUTE FUNCTION company_human_private.block_changed_product_policy();
CREATE TRIGGER usage_limit_policy_access_denial AFTER INSERT ON public.product_usage_limit_revisions
 FOR EACH ROW EXECUTE FUNCTION company_human_private.block_changed_product_policy();

-- Full fenced readback retained separately from the older worker's compact receipt.
CREATE TABLE public.member_denial_access_receipts (
 organization_id text NOT NULL, command_id text NOT NULL, attempt_number integer NOT NULL,
 receipt jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(command_id,attempt_number),
 FOREIGN KEY(command_id,attempt_number) REFERENCES public.member_denial_attempts(command_id,attempt_number) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,command_id) REFERENCES public.product_membership_commands(organization_id,id)
);
ALTER TABLE public.member_denial_access_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_denial_access_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_denial_access_receipts FROM PUBLIC;
GRANT SELECT,INSERT ON public.member_denial_access_receipts TO company_human_policy_denial;
GRANT SELECT ON public.member_denial_access_receipts TO company_human_member_worker,company_human_service;
CREATE POLICY policy_denial_receipt ON public.member_denial_access_receipts TO company_human_policy_denial USING(true) WITH CHECK(true);
CREATE POLICY worker_denial_receipt ON public.member_denial_access_receipts FOR SELECT TO company_human_member_worker
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY admin_denial_receipt ON public.member_denial_access_receipts FOR SELECT TO company_human_service
 USING(company_human_private.has_capability(organization_id,'applications.manage'));
CREATE TRIGGER immutable_denial_access_receipt BEFORE UPDATE ON public.member_denial_access_receipts
 FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_usage_rewrite();
CREATE FUNCTION company_human_private.project_fenced_member_denial(command_id text,lease uuid,receipt jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.member_denial_jobs%ROWTYPE; command public.product_membership_commands%ROWTYPE;
 mapping public.product_memberships%ROWTYPE; access_command public.member_access_commands%ROWTYPE;
 expected jsonb; external_org text; audit_id text; request_id text; happened timestamptz;
BEGIN
 SELECT * INTO job FROM public.member_denial_jobs j WHERE j.command_id=project_fenced_member_denial.command_id
  AND j.organization_id=NULLIF(current_setting('company_human.organization_id',true),'') FOR UPDATE;
 IF NOT FOUND OR job.status<>'running' OR job.lease_token IS DISTINCT FROM lease OR job.lease_expires_at<=clock_timestamp()
  THEN RAISE EXCEPTION 'Stale member denial projection lease' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT command FROM public.product_membership_commands c WHERE c.id=job.command_id AND c.organization_id=job.organization_id;
 SELECT * INTO STRICT access_command FROM public.member_access_commands c WHERE c.command_id=job.command_id AND c.organization_id=job.organization_id;
 SELECT * INTO STRICT mapping FROM public.product_memberships pm WHERE pm.id=command.product_membership_id AND pm.organization_id=job.organization_id FOR UPDATE;
 SELECT external_organization_id INTO external_org FROM public.product_instances WHERE id=mapping.product_instance_id AND organization_id=job.organization_id;
 IF command.operation NOT IN('suspendMember','removeMember') OR command.desired_revision<>mapping.desired_revision
  OR access_command.access_revision<>mapping.access_revision OR (mapping.desired_enabled AND NOT mapping.policy_blocked)
  OR access_command.external_member_id IS NULL OR access_command.external_organization_id IS NULL
  OR access_command.external_member_id IS DISTINCT FROM mapping.external_member_id
  OR access_command.external_organization_id IS DISTINCT FROM external_org THEN RETURN false; END IF;
 expected:=jsonb_build_object('schemaVersion',1,'organizationId',job.organization_id,'productInstanceId',mapping.product_instance_id,
  'membershipId',mapping.membership_id,'target',jsonb_build_object('externalOrganizationId',external_org,'externalMemberId',mapping.external_member_id),
  'accessRevision',access_command.access_revision,'idempotencyKey',command.idempotency_key,
  'access',CASE WHEN command.operation='removeMember' THEN 'removed' ELSE 'suspended' END,'policy',NULL);
 IF receipt IS DISTINCT FROM expected OR NOT EXISTS(SELECT 1 FROM public.member_denial_attempts a WHERE a.command_id=job.command_id
  AND a.organization_id=job.organization_id AND a.attempt_number=job.attempt_count AND a.lease_token=lease
  AND a.finished_at IS NOT NULL AND a.outcome='succeeded' AND a.provider_reference=mapping.external_member_id)
  THEN RAISE EXCEPTION 'Exact fenced denial receipt required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.member_denial_access_receipts(organization_id,command_id,attempt_number,receipt)
  VALUES(job.organization_id,job.command_id,job.attempt_count,receipt) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN true; END IF;
 UPDATE public.product_memberships SET provisioning_status=expected->>'access',updated_at=clock_timestamp()
  WHERE organization_id=job.organization_id AND id=mapping.id;
 audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-','');request_id:=gen_random_uuid()::text;happened:=clock_timestamp();
 INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
 VALUES(audit_id,job.organization_id,'service','member-denial-worker','product.member_denial.projected','product_membership_command',job.command_id,request_id,
  jsonb_build_object('provisioningStatus',expected->>'access','accessRevision',access_command.access_revision,'attemptNumber',job.attempt_count),
  jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',job.organization_id,
   'actor',jsonb_build_object('type','service','id','member-denial-worker'),'action','product.member_denial.projected',
   'target',jsonb_build_object('type','product_membership_command','id',job.command_id),'afterRef',audit_id||':after','requestId',request_id,
   'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION company_human_private.project_fenced_member_denial(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.project_fenced_member_denial(text,uuid,jsonb) TO company_human_member_worker;
GRANT CREATE ON SCHEMA company_human_private TO company_human_policy_denial;
ALTER FUNCTION company_human_private.block_changed_product_policy() OWNER TO company_human_policy_denial;
ALTER FUNCTION company_human_private.project_fenced_member_denial(text,uuid,jsonb) OWNER TO company_human_policy_denial;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_policy_denial;
