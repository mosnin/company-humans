-- Historical V1 limit revisions keep their original interpretation. V2 rows are
-- schema preparation only: no V2 writer or worker is authorized in this release.
ALTER TABLE public.product_usage_limit_revisions
  ADD COLUMN contract_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN meter_version integer,
  ADD CONSTRAINT usage_limit_revision_contract_version CHECK
    ((contract_version=1 AND meter_version IS NULL)
      OR (contract_version=2 AND meter_version BETWEEN 1 AND 2147483647));

-- Budget administrators retain the V1 writer's exact column set. They cannot
-- assert a V2 meter version by direct SQL through the service role.
REVOKE INSERT ON public.product_usage_limit_revisions FROM company_human_service;
GRANT INSERT (organization_id,usage_limit_id,revision,maximum_quantity,actor_user_id)
  ON public.product_usage_limit_revisions TO company_human_service;

CREATE OR REPLACE FUNCTION company_human_private.guard_usage_limit_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE latest integer; prior_contract smallint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('usage-limit-revision:'||NEW.usage_limit_id,0));
  SELECT revision,contract_version INTO latest,prior_contract
    FROM public.product_usage_limit_revisions
    WHERE organization_id=NEW.organization_id AND usage_limit_id=NEW.usage_limit_id
    ORDER BY revision DESC LIMIT 1;
  IF NEW.revision::bigint<>COALESCE(latest,0)::bigint+1 THEN
    RAISE EXCEPTION 'Usage limit revision must follow current revision';
  END IF;
  IF prior_contract=2 AND NEW.contract_version=1 THEN
    RAISE EXCEPTION 'Versioned usage limit cannot return to V1';
  END IF;
  RETURN NEW;
END $$;

-- Only V1 revisions enter the existing V1 dispatch journal. A later V2 writer
-- must install its own journal and exact meter-version provider readback.
CREATE OR REPLACE FUNCTION company_human_private.enqueue_usage_limit_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.contract_version=1 THEN
    INSERT INTO public.usage_limit_jobs(organization_id,usage_limit_id,revision)
      VALUES(NEW.organization_id,NEW.usage_limit_id,NEW.revision);
  END IF;
  RETURN NEW;
END $$;
