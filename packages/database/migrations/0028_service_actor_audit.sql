-- Preserve human identity while representing background execution honestly.
ALTER TABLE public.identity_audit_events ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.identity_audit_events ADD COLUMN actor_type text NOT NULL DEFAULT 'human'
  CHECK (actor_type IN ('human','service'));
ALTER TABLE public.identity_audit_events ADD COLUMN actor_service_id text;
ALTER TABLE public.identity_audit_events ADD CONSTRAINT audit_actor_identity CHECK (
  (actor_type='human' AND actor_user_id IS NOT NULL AND actor_service_id IS NULL
    AND (envelope#>>'{actor,type}') IS NOT DISTINCT FROM 'human'
    AND (envelope#>>'{actor,userId}') IS NOT DISTINCT FROM actor_user_id)
  OR (actor_type='service' AND actor_user_id IS NULL AND actor_membership_id IS NULL
    AND actor_service_id IS NOT NULL AND length(actor_service_id) BETWEEN 1 AND 256
    AND (envelope#>>'{actor,type}') IS NOT DISTINCT FROM 'service'
    AND (envelope#>>'{actor,id}') IS NOT DISTINCT FROM actor_service_id));
GRANT INSERT ON public.identity_audit_events TO company_human_member_worker;
CREATE POLICY member_worker_audit_insert ON public.identity_audit_events FOR INSERT TO company_human_member_worker
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND actor_type='service' AND actor_service_id='member-denial-worker' AND actor_user_id IS NULL
    AND target_type='product_membership_command'
    AND action IN ('product.member_denial.claimed','product.member_denial.received','product.member_denial.exhausted','product.member_denial.superseded')
    AND EXISTS (SELECT 1 FROM public.product_membership_commands c
      WHERE c.organization_id=identity_audit_events.organization_id AND c.id=identity_audit_events.target_id
        AND c.operation IN ('suspendMember','removeMember')));
