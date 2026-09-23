-- Phase 03 storage only. No runtime role can read or write these records, and
-- neither a requested nor a reserved row grants permission to use a provider.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.meter_definitions ADD CONSTRAINT meter_definitions_reservation_aggregation_unique
  UNIQUE (product_id,meter_key,version,unit,aggregation);
-- PostgreSQL numeric accepts NaN; prevent such an event from entering usage
-- storage, including through the existing direct ingestion role.
ALTER TABLE public.usage_events ADD CONSTRAINT usage_events_finite_quantity
  CHECK (quantity::text NOT IN ('NaN','Infinity','-Infinity'));

CREATE TABLE public.budget_reservation_intents (
  reservation_id text PRIMARY KEY CHECK (reservation_id ~ '^ch_res_[0-9a-f]{32}$'),
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  product_id text NOT NULL REFERENCES public.products(id),
  product_instance_id text NOT NULL,
  membership_id text,
  team_id text,
  operation_team_membership_id text,
  capability_key text CHECK (capability_key ~ '^[a-z][a-z0-9._-]{0,127}$'),
  meter_key text NOT NULL,
  meter_version integer NOT NULL CHECK (meter_version BETWEEN 1 AND 2147483647),
  unit text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test','production')),
  aggregation text NOT NULL DEFAULT 'sum' CHECK (aggregation = 'sum'),
  requested_quantity numeric(18,6) NOT NULL CHECK
    (requested_quantity > 0 AND requested_quantity <= 999999999999.999999),
  source_system text NOT NULL CHECK (source_system ~ '^[a-z][a-z0-9._-]*$'),
  source_operation_id text NOT NULL CHECK
    (length(source_operation_id) BETWEEN 1 AND 256 AND source_operation_id !~ '[[:cntrl:]]'),
  idempotency_key text NOT NULL CHECK
    (length(idempotency_key) BETWEEN 1 AND 256 AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  request_fingerprint text NOT NULL CHECK (length(request_fingerprint) BETWEEN 1 AND 4096),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection) = 'object'
    AND COALESCE(jsonb_typeof(projection->'constraints') = 'array'
      AND jsonb_array_length(projection->'constraints') > 0,false)),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  initial_state text NOT NULL DEFAULT 'requested' CHECK (initial_state = 'requested'),
  clock_source text NOT NULL DEFAULT 'database_transaction' CHECK (clock_source = 'database_transaction'),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > recorded_at),
  CHECK ((team_id IS NULL AND operation_team_membership_id IS NULL)
    OR (team_id IS NOT NULL AND operation_team_membership_id IS NOT DISTINCT FROM membership_id)),
  FOREIGN KEY (organization_id,product_id,product_instance_id)
    REFERENCES public.product_instances(organization_id,product_id,id),
  FOREIGN KEY (organization_id,membership_id)
    REFERENCES public.memberships(organization_id,id),
  FOREIGN KEY (organization_id,team_id) REFERENCES public.teams(organization_id,id),
  FOREIGN KEY (organization_id,operation_team_membership_id)
    REFERENCES public.memberships(organization_id,id),
  FOREIGN KEY (product_id,meter_key,meter_version,unit,aggregation)
    REFERENCES public.meter_definitions(product_id,meter_key,version,unit,aggregation),
  UNIQUE (organization_id,product_id,environment,source_system,source_operation_id),
  UNIQUE (organization_id,product_id,environment,idempotency_key),
  UNIQUE (organization_id,product_id,environment,reservation_id)
);

-- A single ledger makes usage-event identity unique across settlement and
-- late reconciliation. Sequence and state are checked while the parent is
-- locked; history never rewrites the terminal capacity state.
CREATE TABLE public.budget_reservation_ledger (
  reservation_id text NOT NULL,
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  organization_id text NOT NULL,
  product_id text NOT NULL,
  environment text NOT NULL,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 2147483647),
  entry_kind text NOT NULL CHECK (entry_kind IN ('transition','late_reconciliation')),
  from_state text,
  to_state text,
  after_state text,
  usage_event_id text REFERENCES public.usage_events(event_id),
  usage_evidence jsonb,
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 512),
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (reservation_id,sequence),
  UNIQUE (usage_event_id),
  FOREIGN KEY (organization_id,product_id,environment,reservation_id)
    REFERENCES public.budget_reservation_intents(organization_id,product_id,environment,reservation_id),
  CHECK ((entry_kind = 'transition' AND after_state IS NULL AND
    ((from_state = 'requested' AND to_state IN ('reserved','rejected')) OR
     (from_state = 'reserved' AND to_state IN ('settled','released','expired'))))
    OR (entry_kind = 'late_reconciliation' AND from_state IS NULL AND to_state IS NULL
      AND after_state IN ('settled','released','expired'))),
  CHECK ((usage_event_id IS NULL AND usage_evidence IS NULL
      AND to_state IS DISTINCT FROM 'settled' AND entry_kind <> 'late_reconciliation')
    OR (usage_event_id IS NOT NULL AND jsonb_typeof(usage_evidence) = 'object'
      AND (to_state = 'settled' OR entry_kind = 'late_reconciliation')))
);
CREATE INDEX budget_reservation_ledger_scope_idx ON public.budget_reservation_ledger
  (organization_id,product_id,environment,reservation_id,sequence DESC);

CREATE FUNCTION company_human_private.guard_budget_reservation_intent() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.recorded_at := transaction_timestamp();
  IF NEW.expires_at <= NEW.recorded_at
    OR NEW.request_payload ->> 'schemaVersion' IS DISTINCT FROM '1'
    OR NEW.request_payload #>> '{operation,schemaVersion}' IS DISTINCT FROM '1'
    OR NEW.request_payload #>> '{operation,operationTeam,organizationId}' IS DISTINCT FROM
      (CASE WHEN NEW.team_id IS NULL THEN NULL ELSE NEW.organization_id END)
    OR NEW.request_payload #>> '{operation,organizationId}' IS DISTINCT FROM NEW.organization_id
    OR NEW.request_payload #>> '{operation,productId}' IS DISTINCT FROM NEW.product_id
    OR NEW.request_payload #>> '{operation,productInstanceId}' IS DISTINCT FROM NEW.product_instance_id
    OR NEW.request_payload #>> '{operation,membershipId}' IS DISTINCT FROM NEW.membership_id
    OR NEW.request_payload #>> '{operation,operationTeam,teamId}' IS DISTINCT FROM NEW.team_id
    OR NEW.request_payload #>> '{operation,operationTeam,membershipId}' IS DISTINCT FROM NEW.operation_team_membership_id
    OR NEW.request_payload #>> '{operation,capabilityKey}' IS DISTINCT FROM NEW.capability_key
    OR NEW.request_payload #>> '{operation,meter,meterKey}' IS DISTINCT FROM NEW.meter_key
    OR NEW.request_payload #>> '{operation,meter,meterVersion}' IS DISTINCT FROM NEW.meter_version::text
    OR NEW.request_payload #>> '{operation,meter,unit}' IS DISTINCT FROM NEW.unit
    OR NEW.request_payload #>> '{source,system}' IS DISTINCT FROM NEW.source_system
    OR NEW.request_payload #>> '{source,operationId}' IS DISTINCT FROM NEW.source_operation_id
    OR NEW.request_payload ->> 'environment' IS DISTINCT FROM NEW.environment
    OR NEW.request_payload ->> 'aggregation' IS DISTINCT FROM NEW.aggregation
    OR (NEW.request_payload ->> 'requestedQuantity')::numeric IS DISTINCT FROM NEW.requested_quantity
    OR NEW.request_payload ->> 'idempotencyKey' IS DISTINCT FROM NEW.idempotency_key
    OR NEW.projection ->> 'schemaVersion' IS DISTINCT FROM '1'
    OR NEW.projection ->> 'organizationId' IS DISTINCT FROM NEW.organization_id
    OR NEW.projection ->> 'productId' IS DISTINCT FROM NEW.product_id
    OR NEW.projection ->> 'environment' IS DISTINCT FROM NEW.environment
    OR NEW.projection ->> 'aggregation' IS DISTINCT FROM NEW.aggregation
    OR NEW.projection #>> '{meter,meterKey}' IS DISTINCT FROM NEW.meter_key
    OR NEW.projection #>> '{meter,meterVersion}' IS DISTINCT FROM NEW.meter_version::text
    OR NEW.projection #>> '{meter,unit}' IS DISTINCT FROM NEW.unit
    OR NEW.projection ->> 'authorizesUsage' IS DISTINCT FROM 'false'
    OR NEW.projection ->> 'providerEnforcementConfirmed' IS DISTINCT FROM 'false'
    OR NEW.provenance ->> 'auditId' IS NULL
    OR NEW.provenance ->> 'requestId' IS NULL THEN
    RAISE EXCEPTION 'Budget reservation intent bindings are invalid';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.guard_budget_reservation_intent() FROM PUBLIC;
CREATE TRIGGER budget_reservation_intent_guard BEFORE INSERT ON public.budget_reservation_intents
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_budget_reservation_intent();

CREATE FUNCTION company_human_private.guard_budget_reservation_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  intent public.budget_reservation_intents%ROWTYPE;
  prior public.budget_reservation_ledger%ROWTYPE;
  event public.usage_events%ROWTYPE;
  current_state text;
BEGIN
  NEW.occurred_at := transaction_timestamp();
  SELECT * INTO intent FROM public.budget_reservation_intents
    WHERE reservation_id = NEW.reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation intent unavailable'; END IF;
  SELECT * INTO prior FROM public.budget_reservation_ledger
    WHERE reservation_id = NEW.reservation_id ORDER BY sequence DESC LIMIT 1;
  current_state := CASE WHEN prior.reservation_id IS NULL THEN 'requested'
    WHEN prior.entry_kind = 'transition' THEN prior.to_state ELSE prior.after_state END;
  IF NEW.sequence <> COALESCE(prior.sequence,0) + 1
    OR NEW.occurred_at < intent.recorded_at
    OR (NEW.entry_kind = 'transition' AND (prior.entry_kind = 'late_reconciliation'
      OR NEW.from_state IS DISTINCT FROM current_state))
    OR (NEW.entry_kind = 'late_reconciliation' AND
      (current_state NOT IN ('settled','released','expired') OR NEW.after_state IS DISTINCT FROM current_state))
    OR (NEW.to_state = 'reserved' AND NEW.occurred_at >= intent.expires_at)
    OR (NEW.to_state = 'expired' AND NEW.occurred_at < intent.expires_at)
    OR (NEW.entry_kind = 'late_reconciliation' AND NEW.after_state = 'expired'
      AND NEW.occurred_at < intent.expires_at)
    OR NEW.provenance ->> 'auditId' IS NULL
    OR NEW.provenance ->> 'requestId' IS NULL THEN
    RAISE EXCEPTION 'Budget reservation ledger edge or clock is invalid';
  END IF;
  IF NEW.usage_event_id IS NOT NULL THEN
    SELECT * INTO event FROM public.usage_events WHERE event_id = NEW.usage_event_id;
    IF NOT FOUND OR event.organization_id IS DISTINCT FROM intent.organization_id
      OR event.product_id IS DISTINCT FROM intent.product_id
      OR event.product_instance_id IS DISTINCT FROM intent.product_instance_id
      OR event.environment IS DISTINCT FROM intent.environment
      OR event.membership_id IS DISTINCT FROM intent.membership_id
      OR event.team_id IS DISTINCT FROM intent.team_id
      OR event.meter_key IS DISTINCT FROM intent.meter_key
      OR event.meter_version IS DISTINCT FROM intent.meter_version
      OR event.unit IS DISTINCT FROM intent.unit
      OR event.source_system IS DISTINCT FROM intent.source_system
      OR event.source_operation_id IS DISTINCT FROM intent.source_operation_id
      OR event.capability_key IS DISTINCT FROM intent.capability_key
      OR (event.disposition = 'quarantined' AND NOT EXISTS
        (SELECT 1 FROM public.usage_quarantine_releases r WHERE r.event_id = event.event_id))
      OR NEW.usage_evidence ->> 'ingestionDisposition' IS DISTINCT FROM
        (CASE WHEN event.disposition = 'accepted' THEN 'accepted'
          WHEN event.disposition = 'quarantined' THEN 'released' ELSE NULL END)
      OR event.quantity <= 0
      OR event.quantity::text IN ('NaN','Infinity','-Infinity')
      OR NEW.usage_evidence ->> 'schemaVersion' IS DISTINCT FROM '1'
      OR NEW.usage_evidence ->> 'eventId' IS DISTINCT FROM event.event_id
      OR NEW.usage_evidence ->> 'organizationId' IS DISTINCT FROM event.organization_id
      OR NEW.usage_evidence ->> 'productId' IS DISTINCT FROM event.product_id
      OR NEW.usage_evidence ->> 'productInstanceId' IS DISTINCT FROM event.product_instance_id
      OR NEW.usage_evidence ->> 'membershipId' IS DISTINCT FROM event.membership_id
      OR NEW.usage_evidence ->> 'teamId' IS DISTINCT FROM event.team_id
      OR NEW.usage_evidence ->> 'capabilityKey' IS DISTINCT FROM event.capability_key
      OR NEW.usage_evidence #>> '{meter,meterKey}' IS DISTINCT FROM event.meter_key
      OR NEW.usage_evidence #>> '{meter,meterVersion}' IS DISTINCT FROM event.meter_version::text
      OR NEW.usage_evidence #>> '{meter,unit}' IS DISTINCT FROM event.unit
      OR NEW.usage_evidence ->> 'environment' IS DISTINCT FROM event.environment
      OR NEW.usage_evidence #>> '{source,system}' IS DISTINCT FROM event.source_system
      OR NEW.usage_evidence #>> '{source,operationId}' IS DISTINCT FROM event.source_operation_id
      OR NOT (CASE WHEN NEW.usage_evidence ->> 'actualQuantity' ~
        '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
        THEN (NEW.usage_evidence ->> 'actualQuantity')::numeric > 0
          AND (NEW.usage_evidence ->> 'actualQuantity')::numeric = event.quantity
        ELSE false END)
      OR NEW.usage_evidence ->> 'sourceEventId' IS DISTINCT FROM event.source_event_id
      OR (NEW.usage_evidence ->> 'occurredAt')::timestamptz IS DISTINCT FROM event.occurred_at
      OR (NEW.usage_evidence ->> 'reportedAt')::timestamptz IS DISTINCT FROM event.reported_at
      OR NEW.occurred_at < event.reported_at
      OR event.occurred_at < intent.recorded_at THEN
      RAISE EXCEPTION 'Budget reservation usage event binding is invalid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.guard_budget_reservation_ledger() FROM PUBLIC;
CREATE TRIGGER budget_reservation_ledger_guard BEFORE INSERT ON public.budget_reservation_ledger
  FOR EACH ROW EXECUTE FUNCTION company_human_private.guard_budget_reservation_ledger();

CREATE TRIGGER immutable_budget_reservation_intent BEFORE UPDATE OR DELETE
  ON public.budget_reservation_intents FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_usage_rewrite();
CREATE TRIGGER immutable_budget_reservation_ledger BEFORE UPDATE OR DELETE
  ON public.budget_reservation_ledger FOR EACH ROW EXECUTE FUNCTION company_human_private.reject_usage_rewrite();
ALTER TABLE public.budget_reservation_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_reservation_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.budget_reservation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_reservation_ledger FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_reservation_intents,public.budget_reservation_ledger FROM PUBLIC;

-- The migration runner applies all pending files in one transaction.
SET LOCAL lock_timeout = DEFAULT;
SET LOCAL statement_timeout = DEFAULT;
