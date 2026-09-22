-- Product meter versions and source usage are immutable; valuation is a separate projection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_usage_ingest') THEN
    CREATE ROLE company_human_usage_ingest NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='company_human_usage_ingest' AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
    RAISE EXCEPTION 'Unsafe preexisting usage ingestion role';
  END IF;
END;
$$;
GRANT USAGE ON SCHEMA public TO company_human_usage_ingest;
CREATE TABLE public.meter_definitions (
  product_id text NOT NULL REFERENCES public.products(id),
  meter_key text NOT NULL CHECK (meter_key ~ '^[a-z][a-z0-9._-]{0,127}$'),
  version integer NOT NULL CHECK (version > 0),
  unit text NOT NULL,
  aggregation text NOT NULL CHECK (aggregation IN ('sum','maximum','last')),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (product_id,meter_key,version)
);
ALTER TABLE public.product_instances ADD CONSTRAINT product_instances_org_product_id_unique UNIQUE (organization_id,product_id,id);
CREATE TABLE public.usage_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^ch_evt_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  product_id text NOT NULL REFERENCES public.products(id),
  product_instance_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test','production')),
  source_system text NOT NULL,
  source_event_id text NOT NULL,
  idempotency_key text NOT NULL,
  membership_id text,
  team_id text,
  meter_key text NOT NULL,
  meter_version integer NOT NULL CHECK (meter_version > 0),
  quantity numeric(18,6) NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL,
  occurred_at timestamptz NOT NULL,
  reported_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  disposition text NOT NULL CHECK (disposition IN ('accepted','quarantined')),
  envelope jsonb NOT NULL,
  signature jsonb NOT NULL,
  FOREIGN KEY (organization_id,product_id,product_instance_id) REFERENCES public.product_instances(organization_id,product_id,id),
  FOREIGN KEY (organization_id,membership_id) REFERENCES public.memberships(organization_id,id),
  FOREIGN KEY (organization_id,team_id) REFERENCES public.teams(organization_id,id),
  UNIQUE (organization_id,product_instance_id,environment,source_system,source_event_id),
  UNIQUE (organization_id,product_instance_id,environment,idempotency_key)
);
CREATE INDEX usage_events_window ON public.usage_events (organization_id,product_instance_id,environment,meter_key,occurred_at);
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.meter_definitions TO company_human_usage_ingest;
GRANT SELECT,INSERT ON public.usage_events TO company_human_usage_ingest;
CREATE POLICY usage_ingest_scope ON public.usage_events TO company_human_usage_ingest
  USING (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND product_instance_id=NULLIF(current_setting('company_human.product_instance_id',true),'')
    AND environment=NULLIF(current_setting('company_human.integration_environment',true),''))
  WITH CHECK (organization_id=NULLIF(current_setting('company_human.organization_id',true),'')
    AND product_instance_id=NULLIF(current_setting('company_human.product_instance_id',true),'')
    AND environment=NULLIF(current_setting('company_human.integration_environment',true),''));
CREATE FUNCTION company_human_private.reject_usage_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Usage history and meter versions are immutable'; END;
$$;
CREATE TRIGGER immutable_usage BEFORE UPDATE OR DELETE ON public.usage_events FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_usage_rewrite();
CREATE TRIGGER immutable_meter BEFORE UPDATE OR DELETE ON public.meter_definitions FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_usage_rewrite();
