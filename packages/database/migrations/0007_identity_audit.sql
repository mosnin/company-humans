DROP POLICY organization_owner_update ON public.organizations;
REVOKE UPDATE ON public.organizations FROM company_human_app;

CREATE TABLE public.identity_audit_events (
  id text PRIMARY KEY CHECK (id ~ '^ch_aud_[0-9a-f]{32}$'),
  organization_id text NOT NULL,
  actor_user_id text NOT NULL,
  actor_membership_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  request_id text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  envelope jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_audit_org_time_idx ON public.identity_audit_events (organization_id, occurred_at DESC);
CREATE INDEX identity_audit_target_idx ON public.identity_audit_events (target_type, target_id);

ALTER TABLE public.identity_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY identity_audit_admin_read ON public.identity_audit_events
  FOR SELECT TO company_human_app
  USING (EXISTS (
    SELECT 1 FROM public.memberships AS m
    WHERE m.organization_id = identity_audit_events.organization_id
      AND m.user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
      AND m.status = 'active' AND m.role_key IN ('owner', 'admin')
  ));
REVOKE ALL ON public.identity_audit_events FROM PUBLIC;
GRANT SELECT ON public.identity_audit_events TO company_human_app;
