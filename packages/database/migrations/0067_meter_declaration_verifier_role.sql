-- Global catalog and immutable meter definitions are operator data, not
-- tenant budget-administrator authority. The verifier role cannot mutate either.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='company_human_meter_verifier') THEN
    CREATE ROLE company_human_meter_verifier NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='company_human_meter_verifier'
    AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unsafe meter verifier role';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO company_human_meter_verifier;
GRANT SELECT (id,catalog_status,catalog_metadata,access_contract_revision)
  ON public.products TO company_human_meter_verifier;
GRANT SELECT (product_id,meter_key,version,unit,aggregation)
  ON public.meter_definitions TO company_human_meter_verifier;
