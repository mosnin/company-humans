-- The global capability catalog and default policy are versioned reference data.
CREATE TABLE public.permissions (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9._-]*$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.role_permission_defaults (
  role_key text NOT NULL CHECK (role_key IN ('owner', 'admin', 'manager', 'contributor', 'finance', 'developer')),
  permission_key text NOT NULL REFERENCES public.permissions(key),
  PRIMARY KEY (role_key, permission_key)
);

ALTER TABLE public.roles ADD CONSTRAINT roles_org_id_key_unique UNIQUE (organization_id, id, key);
ALTER TABLE public.roles ADD CONSTRAINT roles_org_id_unique UNIQUE (organization_id, id);

CREATE TABLE public.role_permissions (
  organization_id text NOT NULL REFERENCES public.organizations(id),
  role_id text NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, role_id, permission_key),
  FOREIGN KEY (organization_id, role_id) REFERENCES public.roles(organization_id, id) ON DELETE CASCADE
);
CREATE INDEX role_permissions_role_idx ON public.role_permissions (role_id);

ALTER TABLE public.memberships ADD COLUMN role_id text;
UPDATE public.memberships AS m SET role_id = r.id
FROM public.roles AS r WHERE r.organization_id = m.organization_id AND r.key = m.role_key;
ALTER TABLE public.memberships ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE public.memberships ADD CONSTRAINT membership_role_identity_fk
  FOREIGN KEY (organization_id, role_id, role_key) REFERENCES public.roles(organization_id, id, key);

CREATE FUNCTION company_human_private.resolve_membership_role_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT r.id INTO NEW.role_id FROM public.roles AS r
    WHERE r.organization_id = NEW.organization_id AND r.key = NEW.role_key;
  ELSIF NEW.role_key IS DISTINCT FROM OLD.role_key OR NEW.role_id IS NULL THEN
    SELECT r.id INTO NEW.role_id FROM public.roles AS r
    WHERE r.organization_id = NEW.organization_id AND r.key = NEW.role_key;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.resolve_membership_role_id() FROM PUBLIC;
CREATE TRIGGER membership_role_id_sync BEFORE INSERT OR UPDATE OF role_key ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION company_human_private.resolve_membership_role_id();

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_tenant_read ON public.role_permissions FOR SELECT TO company_human_app
  USING (company_human_private.has_active_membership(organization_id));
REVOKE ALL ON public.permissions, public.role_permission_defaults, public.role_permissions FROM PUBLIC;
GRANT SELECT ON public.permissions, public.role_permissions TO company_human_app;

INSERT INTO public.permissions (key) VALUES
  ('organization.manage'),
  ('members.manage'),
  ('teams.create'),
  ('teams.manage.assigned'),
  ('teams.manage.all'),
  ('applications.manage'),
  ('budgets.manage'),
  ('assignments.read.own'),
  ('assignments.read.team'),
  ('assignments.read.all'),
  ('assignments.manage.team'),
  ('assignments.manage.all'),
  ('crm.read.own'),
  ('crm.read.team'),
  ('crm.read.all'),
  ('crm.write.own'),
  ('crm.write.team'),
  ('crm.write.all'),
  ('earnings.read.own'),
  ('payouts.read.all'),
  ('billing.read.all'),
  ('usage.read.own'),
  ('usage.read.team'),
  ('usage.read.all'),
  ('context.read.approved'),
  ('context.policy.manage'),
  ('integrations.manage'),
  ('audit.read.all'),
  ('product.use');

INSERT INTO public.role_permission_defaults (role_key, permission_key) VALUES
  ('owner', 'organization.manage'),
  ('owner', 'members.manage'),
  ('owner', 'teams.create'),
  ('owner', 'teams.manage.assigned'),
  ('owner', 'teams.manage.all'),
  ('owner', 'applications.manage'),
  ('owner', 'budgets.manage'),
  ('owner', 'assignments.read.own'),
  ('owner', 'assignments.read.team'),
  ('owner', 'assignments.read.all'),
  ('owner', 'assignments.manage.team'),
  ('owner', 'assignments.manage.all'),
  ('owner', 'crm.read.own'),
  ('owner', 'crm.read.team'),
  ('owner', 'crm.read.all'),
  ('owner', 'crm.write.own'),
  ('owner', 'crm.write.team'),
  ('owner', 'crm.write.all'),
  ('owner', 'earnings.read.own'),
  ('owner', 'payouts.read.all'),
  ('owner', 'billing.read.all'),
  ('owner', 'usage.read.own'),
  ('owner', 'usage.read.team'),
  ('owner', 'usage.read.all'),
  ('owner', 'context.read.approved'),
  ('owner', 'context.policy.manage'),
  ('owner', 'integrations.manage'),
  ('owner', 'audit.read.all'),
  ('owner', 'product.use'),
  ('admin', 'assignments.read.own'),
  ('admin', 'crm.read.own'),
  ('admin', 'crm.write.own'),
  ('admin', 'earnings.read.own'),
  ('admin', 'usage.read.own'),
  ('admin', 'context.read.approved'),
  ('admin', 'product.use'),
  ('admin', 'assignments.read.team'),
  ('admin', 'assignments.manage.team'),
  ('admin', 'crm.read.team'),
  ('admin', 'crm.write.team'),
  ('admin', 'usage.read.team'),
  ('admin', 'teams.manage.assigned'),
  ('admin', 'organization.manage'),
  ('admin', 'members.manage'),
  ('admin', 'teams.create'),
  ('admin', 'teams.manage.all'),
  ('admin', 'applications.manage'),
  ('admin', 'budgets.manage'),
  ('admin', 'assignments.read.all'),
  ('admin', 'assignments.manage.all'),
  ('admin', 'crm.read.all'),
  ('admin', 'crm.write.all'),
  ('admin', 'usage.read.all'),
  ('admin', 'context.policy.manage'),
  ('admin', 'integrations.manage'),
  ('admin', 'audit.read.all'),
  ('manager', 'assignments.read.own'),
  ('manager', 'crm.read.own'),
  ('manager', 'crm.write.own'),
  ('manager', 'earnings.read.own'),
  ('manager', 'usage.read.own'),
  ('manager', 'context.read.approved'),
  ('manager', 'product.use'),
  ('manager', 'assignments.read.team'),
  ('manager', 'assignments.manage.team'),
  ('manager', 'crm.read.team'),
  ('manager', 'crm.write.team'),
  ('manager', 'usage.read.team'),
  ('manager', 'teams.manage.assigned'),
  ('contributor', 'assignments.read.own'),
  ('contributor', 'crm.read.own'),
  ('contributor', 'crm.write.own'),
  ('contributor', 'earnings.read.own'),
  ('contributor', 'usage.read.own'),
  ('contributor', 'context.read.approved'),
  ('contributor', 'product.use'),
  ('finance', 'earnings.read.own'),
  ('finance', 'payouts.read.all'),
  ('finance', 'billing.read.all'),
  ('finance', 'usage.read.all'),
  ('developer', 'integrations.manage'),
  ('developer', 'usage.read.own'),
  ('developer', 'product.use');

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, d.permission_key
FROM public.roles AS r
JOIN public.role_permission_defaults AS d ON d.role_key = r.key;
