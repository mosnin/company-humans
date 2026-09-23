-- Staged signed-ingestion boundary. No runtime role may execute this function.
-- The existing 0044 direct INSERT grant remains until an independently reviewed
-- contract-equivalent verifier and atomic cutover are available.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension AS extension
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'pgcrypto' AND namespace.nspname <> 'public') THEN
    RAISE EXCEPTION 'Verified usage ingest requires pgcrypto installed in public schema';
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_verified_usage_writer') THEN
    CREATE ROLE company_human_verified_usage_writer NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'company_human_verified_usage_writer'
    AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS writer ON writer.rolname = 'company_human_verified_usage_writer'
      WHERE membership.roleid = writer.oid OR membership.member = writer.oid) THEN
    RAISE EXCEPTION 'Unsafe verified usage writer role';
  END IF;
END $$;

CREATE TABLE company_human_private.usage_signing_keys (
  key_id text PRIMARY KEY CHECK (key_id ~ '^[a-z][a-z0-9._-]*$' AND length(key_id) <= 128),
  organization_id text NOT NULL REFERENCES public.organizations(id),
  product_id text NOT NULL REFERENCES public.products(id),
  product_instance_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test','production')),
  source_system text NOT NULL CHECK (source_system ~ '^[a-z][a-z0-9._-]*$' AND length(source_system) <= 128),
  secret bytea NOT NULL CHECK (octet_length(secret) BETWEEN 32 AND 128),
  active_from timestamptz NOT NULL,
  active_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (active_until IS NULL OR active_until > active_from),
  FOREIGN KEY (organization_id,product_id,product_instance_id)
    REFERENCES public.product_instances(organization_id,product_id,id)
);
CREATE TABLE company_human_private.usage_signing_key_revocations (
  key_id text PRIMARY KEY REFERENCES company_human_private.usage_signing_keys(key_id),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 512)
);
ALTER TABLE company_human_private.usage_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_human_private.usage_signing_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE company_human_private.usage_signing_key_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_human_private.usage_signing_key_revocations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON company_human_private.usage_signing_keys,
  company_human_private.usage_signing_key_revocations FROM PUBLIC;

-- The migration owner is the only key administrator. Runtime writers receive
-- SELECT within a no-login SECURITY DEFINER context, never direct key output.
DO $migration_owner$ BEGIN
  EXECUTE format('CREATE POLICY usage_key_admin ON company_human_private.usage_signing_keys TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY usage_key_revocation_admin ON company_human_private.usage_signing_key_revocations TO %I USING (true) WITH CHECK (true)', current_user);
END $migration_owner$;
CREATE POLICY usage_key_writer_read ON company_human_private.usage_signing_keys
  FOR SELECT TO company_human_verified_usage_writer USING (true);
CREATE POLICY usage_key_revocation_writer_read ON company_human_private.usage_signing_key_revocations
  FOR SELECT TO company_human_verified_usage_writer USING (true);
GRANT USAGE ON SCHEMA public, company_human_private TO company_human_verified_usage_writer;
GRANT SELECT ON company_human_private.usage_signing_keys,
  company_human_private.usage_signing_key_revocations TO company_human_verified_usage_writer;
GRANT SELECT ON public.meter_definitions, public.usage_events TO company_human_verified_usage_writer;
GRANT INSERT ON public.usage_events TO company_human_verified_usage_writer;
CREATE POLICY usage_verified_writer_scope ON public.usage_events
  TO company_human_verified_usage_writer USING (true) WITH CHECK (true);
CREATE TRIGGER immutable_usage_signing_key BEFORE UPDATE OR DELETE
  ON company_human_private.usage_signing_keys FOR EACH ROW
  EXECUTE FUNCTION company_human_private.reject_usage_rewrite();
CREATE TRIGGER immutable_usage_signing_key_revocation BEFORE UPDATE OR DELETE
  ON company_human_private.usage_signing_key_revocations FOR EACH ROW
  EXECUTE FUNCTION company_human_private.reject_usage_rewrite();

-- This function verifies an HMAC over the exact UTF-8 canonical body text
-- supplied by the JS signer. It is intentionally ungranted: SQL checks below
-- do not yet prove full Zod equivalence for strict nested source, actor and
-- payload keys, the idempotency grammar, or byte-level metadata and Unicode
-- behavior. The duplicate lookup uses LIMIT 2 into one row and cannot prove
-- that two distinct prior identities were not matched; timestamp casts emit
-- raw SQL errors; text digest comparison has no constant-time guarantee.
-- A future migration must close these gaps and prove two-client races before
-- granting EXECUTE or revoking the legacy direct INSERT path.
CREATE FUNCTION company_human_private.ingest_verified_usage_v1(
  canonical_body text, proof jsonb
) RETURNS TABLE(event_id text, disposition text, duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
  body jsonb;
  authority company_human_private.usage_signing_keys%ROWTYPE;
  prior record;
  target_disposition text;
  signed_digest text;
BEGIN
  IF canonical_body IS NULL OR octet_length(canonical_body) > 65536 OR octet_length(canonical_body) < 2
    OR proof IS NULL OR jsonb_typeof(proof) <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(proof)) <> 3
    OR proof->>'algorithm' IS DISTINCT FROM 'hmac-sha256'
    OR proof->>'keyId' !~ '^[a-z][a-z0-9._-]*$'
    OR proof->>'digest' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid signed usage event';
  END IF;
  BEGIN
    body := canonical_body::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid signed usage event';
  END;
  IF jsonb_typeof(body) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(body)) <> 12
    OR body->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR body->>'eventId' !~ '^ch_evt_[0-9a-f]{32}$'
    OR body->>'organizationId' !~ '^ch_org_[0-9a-f]{32}$'
    OR body->>'productId' !~ '^ch_prod_[0-9a-f]{32}$'
    OR body->>'eventType' IS DISTINCT FROM 'usage.recorded'
    OR body->>'environment' NOT IN ('test','production')
    OR jsonb_typeof(body->'source') IS DISTINCT FROM 'object'
    OR jsonb_typeof(body->'actor') IS DISTINCT FROM 'object'
    OR jsonb_typeof(body->'payload') IS DISTINCT FROM 'object'
    OR length(body->>'idempotencyKey') NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Invalid signed usage event';
  END IF;
  SELECT * INTO authority FROM company_human_private.usage_signing_keys AS keys
    WHERE keys.key_id = proof->>'keyId' AND keys.organization_id = body->>'organizationId'
      AND keys.product_id = body->>'productId'
      AND keys.product_instance_id = body #>> '{payload,productInstanceId}'
      AND keys.environment = body->>'environment'
      AND keys.source_system = body #>> '{source,system}'
      AND keys.active_from <= clock_timestamp()
      AND (keys.active_until IS NULL OR keys.active_until > clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM company_human_private.usage_signing_key_revocations AS revoked
        WHERE revoked.key_id = keys.key_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Usage signing scope denied'; END IF;
  signed_digest := pg_catalog.encode(public.hmac(
    pg_catalog.convert_to('company-human:event:v1' || E'\n' || canonical_body, 'UTF8'),
    authority.secret, 'sha256'), 'hex');
  IF signed_digest IS DISTINCT FROM proof->>'digest' THEN
    RAISE EXCEPTION 'Invalid event signature';
  END IF;
  IF body #>> '{payload,meterKey}' !~ '^[a-z][a-z0-9._-]{0,127}$'
    OR body #>> '{payload,unit}' !~ '^[a-z][a-z0-9._-]{0,127}$'
    OR body #>> '{payload,meterVersion}' !~ '^[1-9][0-9]*$'
    OR (body #>> '{payload,meterVersion}')::numeric > 2147483647
    OR body #>> '{payload,quantity}' !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
    OR jsonb_typeof(body #> '{payload,quantity}') IS DISTINCT FROM 'string'
    OR body #>> '{source,eventId}' IS NULL
    OR length(body #>> '{source,eventId}') NOT BETWEEN 1 AND 256
    OR (body #>> '{occurredAt}')::timestamptz IS NULL
    OR (body #>> '{reportedAt}')::timestamptz IS NULL THEN
    RAISE EXCEPTION 'Invalid signed usage event';
  END IF;
  SELECT u.event_id, u.disposition, u.envelope = body AS identical INTO prior
    FROM public.usage_events AS u
    WHERE u.event_id = body->>'eventId'
      OR (u.organization_id = authority.organization_id AND u.product_instance_id = authority.product_instance_id
        AND u.environment = authority.environment AND u.source_system = authority.source_system
        AND u.source_event_id = body #>> '{source,eventId}')
      OR (u.organization_id = authority.organization_id AND u.product_instance_id = authority.product_instance_id
        AND u.environment = authority.environment AND u.idempotency_key = body->>'idempotencyKey')
    LIMIT 2;
  IF FOUND THEN
    IF NOT prior.identical THEN RAISE EXCEPTION 'Usage idempotency conflict'; END IF;
    RETURN QUERY SELECT prior.event_id::text, prior.disposition::text, true;
    RETURN;
  END IF;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.meter_definitions AS m
    WHERE m.product_id = authority.product_id AND m.meter_key = body #>> '{payload,meterKey}'
      AND m.version = (body #>> '{payload,meterVersion}')::integer
      AND m.unit = body #>> '{payload,unit}') THEN 'accepted' ELSE 'quarantined' END
    INTO target_disposition;
  INSERT INTO public.usage_events (
    event_id,organization_id,product_id,product_instance_id,environment,source_system,
    source_event_id,idempotency_key,membership_id,team_id,meter_key,meter_version,
    quantity,unit,occurred_at,reported_at,disposition,envelope,signature
  ) VALUES (
    body->>'eventId',authority.organization_id,authority.product_id,authority.product_instance_id,
    authority.environment,authority.source_system,body #>> '{source,eventId}',
    body->>'idempotencyKey',body #>> '{payload,membershipId}',body #>> '{payload,teamId}',
    body #>> '{payload,meterKey}',(body #>> '{payload,meterVersion}')::integer,
    (body #>> '{payload,quantity}')::numeric,body #>> '{payload,unit}',
    (body->>'occurredAt')::timestamptz,(body->>'reportedAt')::timestamptz,
    target_disposition,body,proof
  ) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    RETURN QUERY SELECT body->>'eventId', target_disposition, false;
    RETURN;
  END IF;
  SELECT u.event_id, u.disposition, u.envelope = body AS identical INTO prior
    FROM public.usage_events AS u WHERE u.event_id = body->>'eventId'
      OR (u.organization_id = authority.organization_id AND u.product_instance_id = authority.product_instance_id
        AND u.environment = authority.environment AND u.source_system = authority.source_system
        AND u.source_event_id = body #>> '{source,eventId}')
      OR (u.organization_id = authority.organization_id AND u.product_instance_id = authority.product_instance_id
        AND u.environment = authority.environment AND u.idempotency_key = body->>'idempotencyKey')
    LIMIT 2;
  IF NOT FOUND OR NOT prior.identical THEN RAISE EXCEPTION 'Usage idempotency conflict'; END IF;
  RETURN QUERY SELECT prior.event_id::text, prior.disposition::text, true;
END;
$function$;
REVOKE ALL ON FUNCTION company_human_private.ingest_verified_usage_v1(text,jsonb) FROM PUBLIC;
GRANT CREATE ON SCHEMA company_human_private TO company_human_verified_usage_writer;
ALTER FUNCTION company_human_private.ingest_verified_usage_v1(text,jsonb)
  OWNER TO company_human_verified_usage_writer;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_verified_usage_writer;
-- PostgreSQL 16+ can create two edges for a CREATEROLE migrator: a temporary
-- SET edge and an ADMIN-only edge (INHERIT=false, SET=false). Remove the
-- temporary edge. The narrowly scoped ADMIN-only edge may remain because
-- PostgreSQL does not remove it with the SET self-grant. It confers no runtime
-- writer access. Reject every edge involving any other role or access mode.
DO $remove_temporary_membership$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS writer ON writer.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS migrator ON migrator.oid = membership.member
    WHERE writer.rolname = 'company_human_verified_usage_writer'
      AND migrator.rolname = current_user
      AND (membership.set_option OR membership.inherit_option)) THEN
    EXECUTE format('REVOKE company_human_verified_usage_writer FROM %I', current_user);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS writer ON writer.rolname = 'company_human_verified_usage_writer'
    WHERE (membership.roleid = writer.oid OR membership.member = writer.oid)
      AND NOT (membership.roleid = writer.oid
        AND membership.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
        AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option)) THEN
    RAISE EXCEPTION 'Verified usage writer role retains an unsafe membership edge';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS writer ON writer.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS migrator ON migrator.oid = membership.member
    WHERE writer.rolname = 'company_human_verified_usage_writer'
      AND migrator.rolname = current_user) > 1 THEN
    RAISE EXCEPTION 'Verified usage writer role has duplicate migrator grants';
  END IF;
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
    AND (pg_catalog.pg_has_role(current_user, 'company_human_verified_usage_writer', 'SET')
      OR pg_catalog.pg_has_role(current_user, 'company_human_verified_usage_writer', 'USAGE')) THEN
    RAISE EXCEPTION 'Migrator retains verified usage writer access';
  END IF;
END $remove_temporary_membership$;

SET LOCAL lock_timeout = DEFAULT;
SET LOCAL statement_timeout = DEFAULT;
