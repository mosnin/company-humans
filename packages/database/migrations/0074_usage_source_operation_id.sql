-- Reported source provenance is projected only from the immutable signed body.
-- It is not an authorization claim or a unique usage identity: one operation may
-- report several usage events. Older envelopes project SQL NULL.
-- The generated STORED column may rewrite an existing table. Fail the atomic
-- migration on lock contention or an unexpectedly long rewrite; retry only
-- after checking table size and application traffic.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.usage_events
  ADD COLUMN source_operation_id text
  GENERATED ALWAYS AS (envelope #>> '{source,operationId}') STORED;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_source_operation_id_format
  CHECK (
    envelope #> '{source,operationId}' IS NULL
    OR jsonb_typeof(envelope #> '{source,operationId}') = 'null'
    OR (
      jsonb_typeof(envelope #> '{source,operationId}') = 'string'
      AND char_length(source_operation_id) BETWEEN 1 AND 256
      AND source_operation_id !~ '[[:cntrl:]]'
    )
  );

CREATE INDEX usage_events_source_operation_idx
  ON public.usage_events (organization_id, product_id, environment, source_system, source_operation_id)
  WHERE source_operation_id IS NOT NULL;

-- The runner applies all pending migrations in one transaction; do not carry
-- this migration's DDL timeouts into later migration files.
SET LOCAL lock_timeout = DEFAULT;
SET LOCAL statement_timeout = DEFAULT;
