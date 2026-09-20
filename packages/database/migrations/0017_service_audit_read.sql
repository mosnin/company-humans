GRANT SELECT ON public.identity_audit_events TO company_human_service;
CREATE POLICY service_audit_read ON public.identity_audit_events FOR SELECT TO company_human_service
  USING (company_human_private.service_scope(organization_id)
    AND company_human_private.has_capability(organization_id,'audit.read.all'));
