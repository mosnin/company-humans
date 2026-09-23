ALTER TABLE public.products
  ADD COLUMN catalog_status text NOT NULL DEFAULT 'draft' CHECK (catalog_status IN ('draft', 'ready', 'retired')),
  ADD COLUMN catalog_metadata jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE public.product_instances (
  id text PRIMARY KEY CHECK (id ~ '^ch_inst_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  product_id text NOT NULL REFERENCES public.products(id),
  instance_key text NOT NULL CHECK (instance_key ~ '^[a-z][a-z0-9-]*$'),
  mode text NOT NULL CHECK (mode IN ('provisioned', 'connected', 'external_only', 'native_module')),
  desired_enabled boolean NOT NULL DEFAULT true,
  provisioning_status text NOT NULL DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending', 'active', 'failed', 'suspended', 'disconnected')),
  external_organization_id text,
  created_by_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, product_id, instance_key),
  UNIQUE (organization_id, id)
);
CREATE INDEX product_instances_org_status_idx ON public.product_instances (organization_id, desired_enabled, provisioning_status);

ALTER TABLE public.product_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_instances_tenant_read ON public.product_instances
  FOR SELECT TO company_human_app
  USING (company_human_private.has_active_membership(organization_id));
REVOKE ALL ON public.product_instances FROM PUBLIC;
GRANT SELECT ON public.product_instances TO company_human_app;

GRANT SELECT ON public.products TO company_human_app;
