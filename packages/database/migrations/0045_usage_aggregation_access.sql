-- Customer usage readers receive quantities, never provider costs or source payloads.
CREATE FUNCTION company_human_private.can_read_usage(org text, member_id text, target_team text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT company_human_private.has_capability(org,'usage.read.all') OR (
   company_human_private.has_capability(org,'usage.read.own') AND EXISTS (
     SELECT 1 FROM public.memberships m WHERE m.organization_id=org AND m.id=member_id
       AND m.status='active' AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'')
   )
 ) OR (
   company_human_private.has_capability(org,'usage.read.team') AND EXISTS (
     SELECT 1 FROM public.team_memberships tm
     JOIN public.memberships m ON m.organization_id=tm.organization_id AND m.id=tm.membership_id
     JOIN public.teams t ON t.organization_id=tm.organization_id AND t.id=tm.team_id
     WHERE tm.organization_id=org AND tm.team_id=target_team AND tm.team_role='manager'
       AND tm.ended_at IS NULL AND t.status='active' AND m.status='active'
       AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'')
   )
 );
$$;
REVOKE ALL ON FUNCTION company_human_private.can_read_usage(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.can_read_usage(text,text,text) TO company_human_app;
GRANT SELECT ON public.meter_definitions TO company_human_app;
GRANT SELECT (event_id,organization_id,product_id,product_instance_id,environment,membership_id,team_id,
  meter_key,meter_version,quantity,unit,occurred_at,reported_at,disposition) ON public.usage_events TO company_human_app;
CREATE POLICY usage_customer_read ON public.usage_events FOR SELECT TO company_human_app
 USING (disposition='accepted' AND company_human_private.can_read_usage(organization_id,membership_id,team_id));
