-- Revalidation appends provenance; the signed source event is never rewritten.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_usage_revalidator') THEN
  CREATE ROLE company_human_usage_revalidator NOLOGIN NOSUPERUSER NOBYPASSRLS;
 ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_usage_revalidator' AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
  RAISE EXCEPTION 'Unsafe usage revalidator role';
 END IF;
END $$;
CREATE TABLE public.usage_quarantine_releases (
 event_id text PRIMARY KEY REFERENCES public.usage_events(event_id),
 organization_id text NOT NULL REFERENCES public.organizations(id),
 membership_id text,
 team_id text,
 actor_user_id text NOT NULL REFERENCES public.users(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 released_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,membership_id) REFERENCES public.memberships(organization_id,id),
 FOREIGN KEY(organization_id,team_id) REFERENCES public.teams(organization_id,id)
);
ALTER TABLE public.usage_quarantine_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_quarantine_releases FORCE ROW LEVEL SECURITY;
CREATE TRIGGER immutable_usage_release BEFORE UPDATE OR DELETE ON public.usage_quarantine_releases
 FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_usage_rewrite();
GRANT USAGE ON SCHEMA public,company_human_private TO company_human_usage_revalidator;
GRANT EXECUTE ON FUNCTION company_human_private.has_capability(text,text) TO company_human_usage_revalidator;
GRANT SELECT ON public.usage_events,public.meter_definitions TO company_human_usage_revalidator;
CREATE POLICY usage_revalidator_read ON public.usage_events FOR SELECT TO company_human_usage_revalidator
 USING(company_human_private.has_capability(organization_id,'budgets.manage'));
GRANT SELECT,INSERT ON public.usage_quarantine_releases TO company_human_usage_revalidator;
CREATE POLICY usage_revalidator_release ON public.usage_quarantine_releases TO company_human_usage_revalidator
 USING(company_human_private.has_capability(organization_id,'budgets.manage'))
 WITH CHECK(company_human_private.has_capability(organization_id,'budgets.manage') AND actor_user_id=NULLIF(current_setting('company_human.user_id',true),''));
GRANT SELECT(event_id,organization_id) ON public.usage_quarantine_releases TO company_human_app;
CREATE POLICY usage_release_customer_read ON public.usage_quarantine_releases FOR SELECT TO company_human_app
 USING(company_human_private.can_read_usage(organization_id,membership_id,team_id));
GRANT SELECT ON public.usage_quarantine_releases TO company_human_service;
CREATE POLICY usage_release_admin_read ON public.usage_quarantine_releases FOR SELECT TO company_human_service
 USING(company_human_private.has_capability(organization_id,'budgets.manage'));
CREATE FUNCTION company_human_private.release_usage_quarantine(target_event text, adjustment_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source public.usage_events%ROWTYPE;
BEGIN
 IF adjustment_reason IS NULL OR length(trim(adjustment_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid release reason'; END IF;
 SELECT * INTO source FROM public.usage_events WHERE event_id=target_event;
 IF NOT FOUND OR NOT company_human_private.has_capability(source.organization_id,'budgets.manage') THEN
  RAISE EXCEPTION 'Usage recovery unavailable or denied';
 END IF;
 IF source.disposition <> 'quarantined' THEN RAISE EXCEPTION 'Usage is not quarantined'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.meter_definitions m WHERE m.product_id=source.product_id AND m.meter_key=source.meter_key
    AND m.version=source.meter_version AND m.unit=source.unit) THEN RAISE EXCEPTION 'Exact meter registration required'; END IF;
 INSERT INTO public.usage_quarantine_releases(event_id,organization_id,membership_id,team_id,actor_user_id,reason)
 VALUES(source.event_id,source.organization_id,source.membership_id,source.team_id,NULLIF(current_setting('company_human.user_id',true),''),trim(adjustment_reason))
 ON CONFLICT(event_id) DO NOTHING;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION company_human_private.release_usage_quarantine(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.release_usage_quarantine(text,text) TO company_human_service;
GRANT CREATE ON SCHEMA company_human_private TO company_human_usage_revalidator;
ALTER FUNCTION company_human_private.release_usage_quarantine(text,text) OWNER TO company_human_usage_revalidator;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_usage_revalidator;
DROP POLICY usage_customer_read ON public.usage_events;
CREATE POLICY usage_customer_read ON public.usage_events FOR SELECT TO company_human_app
 USING(company_human_private.can_read_usage(organization_id,membership_id,team_id) AND
 (disposition='accepted' OR EXISTS(SELECT 1 FROM public.usage_quarantine_releases r WHERE r.event_id=usage_events.event_id AND r.organization_id=usage_events.organization_id)));
