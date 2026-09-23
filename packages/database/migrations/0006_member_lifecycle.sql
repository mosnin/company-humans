CREATE TABLE public.membership_invitations (
  id text PRIMARY KEY CHECK (id ~ '^ch_inv_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  recipient_email text NOT NULL CHECK (recipient_email = lower(recipient_email)),
  role_key text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_user_id text NOT NULL REFERENCES public.users(id),
  accepted_by_user_id text REFERENCES public.users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, role_key) REFERENCES public.roles(organization_id, key)
);
CREATE UNIQUE INDEX membership_invitations_pending_unique
  ON public.membership_invitations (organization_id, recipient_email) WHERE status = 'pending';
CREATE INDEX membership_invitations_org_idx ON public.membership_invitations (organization_id, status);

ALTER TABLE public.team_memberships ADD COLUMN ended_at timestamptz;
DROP POLICY team_memberships_self_read ON public.team_memberships;
CREATE POLICY team_memberships_self_read ON public.team_memberships FOR SELECT TO company_human_app
  USING (ended_at IS NULL AND membership_id IN (
    SELECT m.id FROM public.memberships AS m
    WHERE m.user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
      AND m.status = 'active'
  ));

ALTER TABLE public.membership_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_admin_read ON public.membership_invitations
  FOR SELECT TO company_human_app
  USING (EXISTS (
    SELECT 1 FROM public.memberships AS m
    WHERE m.organization_id = membership_invitations.organization_id
      AND m.user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
      AND m.status = 'active' AND m.role_key IN ('owner', 'admin')
  ));
REVOKE ALL ON public.membership_invitations FROM PUBLIC;
GRANT SELECT (id, organization_id, recipient_email, role_key, status, invited_by_user_id,
  accepted_by_user_id, expires_at, accepted_at, revoked_at, created_at)
  ON public.membership_invitations TO company_human_app;
