-- A canonical tombstone atomically denies desired product access; delivery stays asynchronous.
ALTER TABLE public.product_membership_commands ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.product_membership_commands ADD COLUMN actor_service_id text;
ALTER TABLE public.product_membership_commands ADD COLUMN source_user_id text REFERENCES public.users(id);
ALTER TABLE public.product_membership_commands ADD COLUMN source_event_timestamp bigint;
ALTER TABLE public.product_membership_commands ADD CONSTRAINT membership_command_actor CHECK (COALESCE((
 (actor_user_id IS NOT NULL AND actor_service_id IS NULL AND source_user_id IS NULL AND source_event_timestamp IS NULL)
 OR (actor_user_id IS NULL AND actor_service_id='identity-offboarding' AND source_user_id IS NOT NULL
   AND source_event_timestamp IS NOT NULL AND source_event_timestamp>=0 AND operation='suspendMember')),false));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_identity_offboarding') THEN
  CREATE ROLE company_human_identity_offboarding NOLOGIN NOSUPERUSER NOBYPASSRLS;
 ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_identity_offboarding' AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe identity offboarding owner'; END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_identity_offboarding;
GRANT SELECT ON public.users,public.memberships,public.product_memberships TO company_human_identity_offboarding;
-- UPDATE permission is required for SELECT FOR SHARE. No callable SQL mutation is exposed.
GRANT UPDATE(status) ON public.users TO company_human_identity_offboarding;
GRANT UPDATE(desired_enabled,desired_revision,updated_at) ON public.product_memberships TO company_human_identity_offboarding;
GRANT INSERT ON public.product_membership_commands,public.identity_audit_events TO company_human_identity_offboarding;
CREATE POLICY identity_offboarding_members ON public.memberships FOR SELECT TO company_human_identity_offboarding USING(true);
CREATE POLICY identity_offboarding_mappings ON public.product_memberships TO company_human_identity_offboarding USING(true) WITH CHECK(NOT desired_enabled);
CREATE POLICY identity_offboarding_command ON public.product_membership_commands FOR INSERT TO company_human_identity_offboarding
 WITH CHECK(actor_user_id IS NULL AND actor_service_id='identity-offboarding' AND operation='suspendMember'
  AND EXISTS(SELECT 1 FROM public.users u JOIN public.memberships m ON m.user_id=u.id
    JOIN public.product_memberships pm ON pm.membership_id=m.id AND pm.organization_id=m.organization_id
    WHERE u.id=source_user_id AND u.status='deleted' AND u.provider_event_timestamp=source_event_timestamp
     AND pm.organization_id=product_membership_commands.organization_id AND pm.id=product_membership_commands.product_membership_id
     AND NOT pm.desired_enabled AND pm.desired_revision=product_membership_commands.desired_revision));
CREATE POLICY identity_offboarding_audit ON public.identity_audit_events FOR INSERT TO company_human_identity_offboarding
 WITH CHECK(actor_type='service' AND actor_service_id='identity-offboarding' AND actor_user_id IS NULL
  AND action='identity.deleted.product_denied' AND target_type='product_membership');

CREATE FUNCTION company_human_private.deny_deleted_identity_products() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mapping record; revision integer; command_id text; audit_id text; request_id text; happened timestamptz; state jsonb;
BEGIN
 IF OLD.status<>'active' OR NEW.status<>'deleted' THEN RETURN NEW; END IF;
 -- The UPDATE already owns the user row. Product creation shares that row before insertion.
 FOR mapping IN SELECT pm.id,pm.organization_id FROM public.product_memberships pm
  JOIN public.memberships m ON m.organization_id=pm.organization_id AND m.id=pm.membership_id
  WHERE m.user_id=NEW.id AND pm.desired_enabled ORDER BY pm.organization_id,pm.id
 LOOP
  UPDATE public.product_memberships SET desired_enabled=false,desired_revision=desired_revision+1,updated_at=clock_timestamp()
   WHERE id=mapping.id AND organization_id=mapping.organization_id AND desired_enabled RETURNING desired_revision INTO revision;
  IF NOT FOUND THEN CONTINUE; END IF;
  command_id:='ch_op_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.product_membership_commands(id,organization_id,product_membership_id,desired_revision,operation,idempotency_key,
    actor_service_id,source_user_id,source_event_timestamp)
   VALUES(command_id,mapping.organization_id,mapping.id,revision,'suspendMember',mapping.id||':identity-delete:'||NEW.provider_event_timestamp,
    'identity-offboarding',NEW.id,NEW.provider_event_timestamp);
  audit_id:='ch_aud_'||replace(gen_random_uuid()::text,'-',''); request_id:=gen_random_uuid()::text; happened:=clock_timestamp();
  state:=jsonb_build_object('desiredEnabled',false,'desiredRevision',revision,'sourceUserId',NEW.id,
    'sourceEventTimestamp',NEW.provider_event_timestamp,'commandId',command_id);
  INSERT INTO public.identity_audit_events(id,organization_id,actor_type,actor_service_id,action,target_type,target_id,request_id,after_state,envelope,occurred_at)
   VALUES(audit_id,mapping.organization_id,'service','identity-offboarding','identity.deleted.product_denied','product_membership',mapping.id,request_id,state,
    jsonb_build_object('schemaVersion',1,'auditId',audit_id,'organizationId',mapping.organization_id,
      'actor',jsonb_build_object('type','service','id','identity-offboarding'),'action','identity.deleted.product_denied',
      'target',jsonb_build_object('type','product_membership','id',mapping.id),'afterRef',audit_id||':after','requestId',request_id,
      'occurredAt',to_char(happened AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),happened);
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.deny_deleted_identity_products() FROM PUBLIC;
CREATE TRIGGER identity_product_denial AFTER UPDATE OF status ON public.users
 FOR EACH ROW EXECUTE FUNCTION company_human_private.deny_deleted_identity_products();

CREATE FUNCTION company_human_private.lock_product_identity() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity_status text;
BEGIN
 IF NOT NEW.desired_enabled THEN RETURN NEW; END IF;
 SELECT u.status INTO identity_status FROM public.users u JOIN public.memberships m ON m.user_id=u.id
 WHERE m.organization_id=NEW.organization_id AND m.id=NEW.membership_id FOR SHARE OF u;
 IF identity_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Product identity unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.lock_product_identity() FROM PUBLIC;
-- Alphabetical ordering puts this before product_membership_parent_lock on INSERT.
CREATE TRIGGER product_identity_lock BEFORE INSERT OR UPDATE OF desired_enabled ON public.product_memberships
 FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_product_identity();
CREATE FUNCTION company_human_private.lock_membership_identity() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity_status text;
BEGIN
 SELECT status INTO identity_status FROM public.users WHERE id=NEW.user_id FOR SHARE;
 IF identity_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Membership identity unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.lock_membership_identity() FROM PUBLIC;
CREATE TRIGGER membership_identity_lock BEFORE INSERT OR UPDATE OF user_id ON public.memberships
 FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_membership_identity();
GRANT CREATE ON SCHEMA company_human_private TO company_human_identity_offboarding;
ALTER FUNCTION company_human_private.deny_deleted_identity_products() OWNER TO company_human_identity_offboarding;
ALTER FUNCTION company_human_private.lock_product_identity() OWNER TO company_human_identity_offboarding;
ALTER FUNCTION company_human_private.lock_membership_identity() OWNER TO company_human_identity_offboarding;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_identity_offboarding;
