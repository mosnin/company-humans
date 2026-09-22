-- One monotonic access stream for provider mutations. This migration enables
-- denials only; it does not authorize or manufacture any activation.
ALTER TABLE public.product_memberships ADD COLUMN access_revision bigint NOT NULL DEFAULT 0 CHECK(access_revision>=0);
CREATE TABLE public.member_access_commands (
 command_id text PRIMARY KEY,
 organization_id text NOT NULL,
 product_membership_id text NOT NULL,
 access_revision bigint NOT NULL CHECK(access_revision>0 AND access_revision<=9007199254740991),
 external_organization_id text,
 external_member_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,product_membership_id,access_revision),
 FOREIGN KEY(organization_id,command_id) REFERENCES public.product_membership_commands(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,product_membership_id) REFERENCES public.product_memberships(organization_id,id)
);
ALTER TABLE public.member_access_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_access_commands FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_access_commands FROM PUBLIC;
GRANT SELECT ON public.member_access_commands TO company_human_member_worker;
CREATE POLICY member_access_worker_read ON public.member_access_commands FOR SELECT TO company_human_member_worker
 USING(organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE TRIGGER immutable_member_access BEFORE UPDATE ON public.member_access_commands
 FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_usage_rewrite();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_access_journal') THEN
 CREATE ROLE company_human_access_journal NOLOGIN NOSUPERUSER NOBYPASSRLS;
 ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='company_human_access_journal' AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
 RAISE EXCEPTION 'Unsafe access journal owner'; END IF;
END $$;
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_access_journal;
GRANT SELECT ON public.product_memberships,public.product_instances TO company_human_access_journal;
GRANT UPDATE(access_revision) ON public.product_memberships TO company_human_access_journal;
GRANT INSERT ON public.member_access_commands,public.member_denial_jobs TO company_human_access_journal;
-- Only a non-login trigger owner receives these policies; caller authorization is
-- enforced by the existing immutable lifecycle command INSERT policy.
CREATE POLICY access_journal_mapping ON public.product_memberships TO company_human_access_journal USING(true) WITH CHECK(true);
CREATE POLICY access_journal_instance ON public.product_instances FOR SELECT TO company_human_access_journal USING(true);
CREATE POLICY access_journal_insert ON public.member_access_commands FOR INSERT TO company_human_access_journal WITH CHECK(true);
CREATE POLICY access_journal_job ON public.member_denial_jobs FOR INSERT TO company_human_access_journal WITH CHECK(true);
CREATE FUNCTION company_human_private.enqueue_fenced_member_denial() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mapping public.product_memberships%ROWTYPE; external_org text;
BEGIN
 IF NEW.operation NOT IN ('suspendMember','removeMember') THEN RETURN NEW; END IF;
 UPDATE public.product_memberships SET access_revision=access_revision+1
 WHERE organization_id=NEW.organization_id AND id=NEW.product_membership_id RETURNING * INTO mapping;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing access mapping'; END IF;
 SELECT external_organization_id INTO external_org FROM public.product_instances
 WHERE organization_id=mapping.organization_id AND id=mapping.product_instance_id;
 INSERT INTO public.member_access_commands(command_id,organization_id,product_membership_id,access_revision,external_organization_id,external_member_id)
 VALUES(NEW.id,NEW.organization_id,NEW.product_membership_id,mapping.access_revision,external_org,mapping.external_member_id);
 INSERT INTO public.member_denial_jobs(command_id,organization_id) VALUES(NEW.id,NEW.organization_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.enqueue_fenced_member_denial() FROM PUBLIC;
CREATE TRIGGER enqueue_fenced_member_denial AFTER INSERT ON public.product_membership_commands
 FOR EACH ROW EXECUTE FUNCTION company_human_private.enqueue_fenced_member_denial();
GRANT CREATE ON SCHEMA company_human_private TO company_human_access_journal;
ALTER FUNCTION company_human_private.enqueue_fenced_member_denial() OWNER TO company_human_access_journal;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_access_journal;
-- Preserve historical jobs/receipts; allocating a revision is not provider success.
INSERT INTO public.member_access_commands(command_id,organization_id,product_membership_id,access_revision,external_organization_id,external_member_id)
 SELECT c.id,c.organization_id,c.product_membership_id,row_number() OVER(PARTITION BY c.product_membership_id ORDER BY c.desired_revision),i.external_organization_id,pm.external_member_id
 FROM public.product_membership_commands c JOIN public.product_memberships pm ON pm.id=c.product_membership_id AND pm.organization_id=c.organization_id
 JOIN public.product_instances i ON i.id=pm.product_instance_id AND i.organization_id=pm.organization_id
 WHERE c.operation IN('suspendMember','removeMember');
UPDATE public.product_memberships pm SET access_revision=x.revision FROM
 (SELECT product_membership_id,max(access_revision) revision FROM public.member_access_commands GROUP BY product_membership_id) x WHERE pm.id=x.product_membership_id;
INSERT INTO public.member_denial_jobs(command_id,organization_id) SELECT command_id,organization_id FROM public.member_access_commands ON CONFLICT DO NOTHING;
