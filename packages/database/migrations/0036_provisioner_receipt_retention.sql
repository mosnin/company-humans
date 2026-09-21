-- A restricted worker must retain an in-flight result after human authority is
-- revoked. These grants do not expand either activation function's authority.
CREATE POLICY provisioner_receipt_operations ON public.provisioning_operations TO company_human_provisioner
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''))
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY provisioner_receipt_attempts ON public.provisioning_attempts TO company_human_provisioner
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''))
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
CREATE POLICY provisioner_receipt_instances ON public.product_instances FOR SELECT TO company_human_provisioner
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),''));
DROP POLICY provisioner_audit_insert ON public.identity_audit_events;
CREATE POLICY provisioner_service_audit ON public.identity_audit_events FOR INSERT TO company_human_provisioner
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND actor_type='service' AND actor_service_id='organization-provisioner' AND actor_user_id IS NULL
    AND target_type='provisioning_operation'
    AND action IN ('product.provisioning.claimed','product.provisioning.received','product.provisioning.exhausted')
    AND EXISTS (SELECT 1 FROM public.provisioning_operations o WHERE o.organization_id=identity_audit_events.organization_id AND o.id=identity_audit_events.target_id));
