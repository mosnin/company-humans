-- Canonical mapping intent. External membership success requires a later restricted
-- adapter receipt boundary; ordinary application credentials cannot manufacture it.
CREATE TABLE public.product_memberships (
  id text PRIMARY KEY CHECK (id ~ '^ch_pmem_[0-9a-f]{32}$'),
  organization_id text NOT NULL,
  product_instance_id text NOT NULL,
  membership_id text NOT NULL,
  desired_enabled boolean NOT NULL DEFAULT true,
  provisioning_status text NOT NULL DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending','active','suspended','removed','failed')),
  external_member_id text CHECK (length(external_member_id) BETWEEN 1 AND 512),
  provider_receipt_reference text CHECK (length(provider_receipt_reference) BETWEEN 1 AND 512),
  provisioned_at timestamptz,
  created_by_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,product_instance_id,membership_id),
  UNIQUE (organization_id,product_instance_id,external_member_id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES public.product_instances(organization_id,id),
  FOREIGN KEY (organization_id,membership_id) REFERENCES public.memberships(organization_id,id),
  CHECK (provisioning_status <> 'active' OR
    (external_member_id IS NOT NULL AND provider_receipt_reference IS NOT NULL AND provisioned_at IS NOT NULL))
);
CREATE INDEX product_memberships_member ON public.product_memberships(organization_id,membership_id);
ALTER TABLE public.product_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_memberships FROM PUBLIC;
GRANT SELECT ON public.product_memberships TO company_human_service;
GRANT INSERT (id,organization_id,product_instance_id,membership_id,created_by_user_id)
  ON public.product_memberships TO company_human_service;
GRANT UPDATE (desired_enabled,updated_at) ON public.product_memberships TO company_human_service;
CREATE POLICY product_memberships_admin_read ON public.product_memberships FOR SELECT TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'));
CREATE POLICY product_memberships_admin_insert ON public.product_memberships FOR INSERT TO company_human_service
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage')
    AND created_by_user_id = NULLIF(current_setting('company_human.user_id',true),'')
    AND EXISTS (SELECT 1 FROM public.memberships m JOIN public.users u ON u.id=m.user_id
      WHERE m.organization_id=product_memberships.organization_id AND m.id=product_memberships.membership_id
        AND m.status='active' AND u.status='active')
    AND EXISTS (SELECT 1 FROM public.product_instances i JOIN public.products p ON p.id=i.product_id
      WHERE i.organization_id=product_memberships.organization_id AND i.id=product_memberships.product_instance_id
        AND i.desired_enabled AND i.provisioning_status='active' AND p.catalog_status<>'retired'));
-- Only denial is exposed here. Re-enabling needs reconciled provider/entitlement state.
CREATE POLICY product_memberships_admin_disable ON public.product_memberships FOR UPDATE TO company_human_service
  USING (company_human_private.has_capability(organization_id,'applications.manage'))
  WITH CHECK (company_human_private.has_capability(organization_id,'applications.manage') AND NOT desired_enabled);
