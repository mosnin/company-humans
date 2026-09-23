-- Signed capability attribution is a stored projection of the immutable source
-- envelope. Missing and JSON null values remain SQL NULL; empty strings are
-- preserved and rejected by the format constraint below.
ALTER TABLE public.usage_events
  ADD COLUMN capability_key text
  GENERATED ALWAYS AS (envelope #>> '{payload,capabilityKey}') STORED;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_capability_key_format
  CHECK (capability_key IS NULL OR capability_key ~ '^[a-z][a-z0-9._-]{0,127}$');

CREATE INDEX usage_events_capability_occurrence_idx
  ON public.usage_events (organization_id, product_id, capability_key, occurred_at);

GRANT SELECT (capability_key) ON public.usage_events TO company_human_app;
