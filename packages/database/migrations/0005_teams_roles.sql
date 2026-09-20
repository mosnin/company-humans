CREATE TABLE public.roles (
  id text PRIMARY KEY CHECK (id ~ '^ch_role_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  key text NOT NULL CHECK (key IN ('owner', 'admin', 'manager', 'contributor', 'finance', 'developer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
CREATE INDEX roles_organization_idx ON public.roles (organization_id);

INSERT INTO public.roles (id, organization_id, key)
SELECT 'ch_role_' || replace(gen_random_uuid()::text, '-', ''), o.id, role_key.key
FROM public.organizations AS o
CROSS JOIN (VALUES ('owner'), ('admin'), ('manager'), ('contributor'), ('finance'), ('developer')) AS role_key(key);

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_organization_role_fk
  FOREIGN KEY (organization_id, role_key) REFERENCES public.roles(organization_id, key);

CREATE TABLE public.teams (
  id text PRIMARY KEY CHECK (id ~ '^ch_team_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);
CREATE INDEX teams_organization_idx ON public.teams (organization_id);

CREATE TABLE public.team_memberships (
  organization_id text NOT NULL REFERENCES public.organizations(id),
  team_id text NOT NULL,
  membership_id text NOT NULL,
  team_role text NOT NULL CHECK (team_role IN ('manager', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, membership_id),
  FOREIGN KEY (organization_id, team_id) REFERENCES public.teams(organization_id, id),
  FOREIGN KEY (organization_id, membership_id) REFERENCES public.memberships(organization_id, id)
);
CREATE INDEX team_memberships_membership_idx ON public.team_memberships (membership_id);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_tenant_read ON public.roles FOR SELECT TO company_human_app
  USING (company_human_private.has_active_membership(organization_id));
CREATE POLICY teams_tenant_read ON public.teams FOR SELECT TO company_human_app
  USING (company_human_private.has_active_membership(organization_id));
CREATE POLICY team_memberships_self_read ON public.team_memberships FOR SELECT TO company_human_app
  USING (membership_id IN (
    SELECT m.id FROM public.memberships AS m
    WHERE m.user_id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
      AND m.status = 'active'
  ));

REVOKE ALL ON public.roles, public.teams, public.team_memberships FROM PUBLIC;
GRANT SELECT ON public.roles, public.teams, public.team_memberships TO company_human_app;
