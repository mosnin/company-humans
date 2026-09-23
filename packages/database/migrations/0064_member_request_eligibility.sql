-- A direct SQL caller cannot label an incomplete catalog as ready. This
-- structural validator mirrors the required V1 fields and strict key set.
-- Runtime URLs use a conservative HTTP(S) subset for safe application links.
CREATE FUNCTION company_human_private.catalog_http_url_valid(value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE port text;
BEGIN
 IF value IS NULL OR value !~* '^https?://[a-z0-9_.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' THEN RETURN false; END IF;
 port:=substring(value FROM '^https?://[a-z0-9_.-]+:([0-9]{1,5})([/?#]|$)');
 IF port IS NOT NULL AND port::integer>65535 THEN RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION company_human_private.catalog_http_url_valid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.catalog_http_url_valid(text) TO company_human_service;

CREATE FUNCTION company_human_private.ready_catalog_metadata_valid(meta jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE field text; item jsonb; link record;
BEGIN
 IF jsonb_typeof(meta) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(meta) AS key(name)
   WHERE key.name <> ALL(ARRAY['schemaVersion','description','category','iconUrl','supportedCapabilities',
     'provisioningModes','supportedMemberOperations','usageMeters','requiredPermissions','healthEndpoint',
     'adapterVersion','billingBehavior','deepLinks','connectionRequirements'])) THEN RETURN false; END IF;
 IF meta->'schemaVersion' IS DISTINCT FROM '1'::jsonb
   OR jsonb_typeof(meta->'description') IS DISTINCT FROM 'string'
   OR length(btrim(meta->>'description')) NOT BETWEEN 1 AND 2000
   OR jsonb_typeof(meta->'category') IS DISTINCT FROM 'string'
   OR meta->>'category' !~ '^[a-z][a-z0-9._-]*$'
   OR jsonb_typeof(meta->'adapterVersion') IS DISTINCT FROM 'string'
   OR length(meta->>'adapterVersion') NOT BETWEEN 1 AND 64
   OR jsonb_typeof(meta->'billingBehavior') IS DISTINCT FROM 'string'
   OR meta->>'billingBehavior' NOT IN('organization_sponsored','external_merchant','native')
   OR jsonb_typeof(meta->'deepLinks') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 FOREACH field IN ARRAY ARRAY['supportedCapabilities','provisioningModes','supportedMemberOperations',
   'usageMeters','requiredPermissions','connectionRequirements'] LOOP
  IF jsonb_typeof(meta->field) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF field='provisioningModes' AND jsonb_array_length(meta->field)=0 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(meta->field) AS entry(value) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR item#>>'{}' !~ '^[a-z][a-z0-9._-]*$' THEN RETURN false; END IF;
   IF field='provisioningModes' AND item#>>'{}' NOT IN('provisioned','connected','external_only','native_module') THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 FOREACH field IN ARRAY ARRAY['iconUrl','healthEndpoint'] LOOP
  IF meta ? field AND (jsonb_typeof(meta->field) IS DISTINCT FROM 'string'
    OR NOT company_human_private.catalog_http_url_valid(meta->>field)) THEN RETURN false; END IF;
 END LOOP;
 FOR link IN SELECT key,value FROM jsonb_each(meta->'deepLinks') LOOP
  IF link.key !~ '^[a-z][a-z0-9._-]*$' OR jsonb_typeof(link.value) IS DISTINCT FROM 'string'
    OR NOT company_human_private.catalog_http_url_valid(link.value#>>'{}') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION company_human_private.ready_catalog_metadata_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.ready_catalog_metadata_valid(jsonb) TO company_human_service;

-- A service caller may request only current, sponsored access. Keep this
-- VOLATILE so each read follows the authority locks taken by the trigger.
CREATE FUNCTION company_human_private.member_request_eligible(org text, instance text, member text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE requested record; metadata jsonb; actor text;
BEGIN
 actor:=NULLIF(current_setting('company_human.user_id',true),'');
 IF org IS NULL OR instance IS NULL OR member IS NULL
   OR actor IS NULL OR org IS DISTINCT FROM NULLIF(current_setting('company_human.organization_id',true),'') THEN RETURN false; END IF;
 -- The older permissive INSERT policy uses a STABLE capability function.
 -- Recheck its authority here with a fresh post-lock snapshot.
 IF NOT EXISTS(SELECT 1 FROM public.organizations o
   JOIN public.memberships actor_member ON actor_member.organization_id=o.id AND actor_member.user_id=actor
   JOIN public.users actor_user ON actor_user.id=actor_member.user_id
   JOIN public.role_permissions grant_row ON grant_row.organization_id=o.id AND grant_row.role_id=actor_member.role_id
   WHERE o.id=org AND o.status='active' AND actor_member.status='active' AND actor_user.status='active'
     AND grant_row.permission_key='applications.manage') THEN RETURN false; END IF;
 SELECT m.role_id,p.catalog_metadata,i.mode INTO requested
 FROM public.organizations o
 JOIN public.product_instances i ON i.organization_id=o.id AND i.id=instance
 JOIN public.products p ON p.id=i.product_id
 JOIN public.memberships m ON m.organization_id=o.id AND m.id=member
 JOIN public.users u ON u.id=m.user_id
 WHERE o.id=org AND o.status='active' AND i.desired_enabled AND i.provisioning_status='active'
   AND p.catalog_status='ready' AND m.status='active' AND u.status='active';
 IF NOT FOUND THEN RETURN false; END IF;
 metadata:=requested.catalog_metadata;
 IF NOT company_human_private.ready_catalog_metadata_valid(metadata) THEN RETURN false; END IF;
 IF NOT (metadata->'provisioningModes' ? requested.mode)
   OR NOT (metadata->'supportedMemberOperations' ? 'provision') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(metadata->'requiredPermissions') AS item(value)
   WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
      OR item.value#>>'{}' !~ '^[a-z][a-z0-9._-]*$'
      OR NOT EXISTS(SELECT 1 FROM public.permissions known WHERE known.key=item.value#>>'{}')) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM (
     SELECT 'product.use'::text permission
     UNION SELECT item.value#>>'{}' FROM jsonb_array_elements(metadata->'requiredPermissions') AS item(value)
   ) required WHERE NOT EXISTS(SELECT 1 FROM public.role_permissions rp
      WHERE rp.organization_id=org AND rp.role_id=requested.role_id AND rp.permission_key=required.permission))
 THEN RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION company_human_private.member_request_eligible(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.member_request_eligible(text,text,text) TO company_human_service;

CREATE POLICY product_membership_request_eligibility ON public.product_memberships
 AS RESTRICTIVE FOR INSERT TO company_human_service
 WITH CHECK(company_human_private.member_request_eligible(organization_id,product_instance_id,membership_id));

-- The service role cannot lock the actor user row directly. The existing
-- identity-offboarding owner can hold that narrow share lock until commit.
-- Both member parent keys are acquired in sorted order: cross-requests A→B
-- and B→A cannot reverse the lock order.
CREATE FUNCTION company_human_private.lock_member_request_context(org text,actor_member text,target_member text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor text; actual_actor_member text; first_member text; second_member text;
 actor_status text; target_status text; user_status text;
BEGIN
 actor:=NULLIF(current_setting('company_human.user_id',true),'');
 IF org IS NULL OR actor_member IS NULL OR target_member IS NULL OR actor IS NULL
   OR org IS DISTINCT FROM NULLIF(current_setting('company_human.organization_id',true),'') THEN
  RAISE EXCEPTION 'Member request context unavailable' USING ERRCODE='42501';
 END IF;
 SELECT m.id INTO actual_actor_member FROM public.memberships m
   WHERE m.organization_id=org AND m.user_id=actor;
 IF actual_actor_member IS DISTINCT FROM actor_member THEN
  RAISE EXCEPTION 'Member request actor unavailable' USING ERRCODE='42501';
 END IF;
 first_member:=LEAST(actor_member,target_member);second_member:=GREATEST(actor_member,target_member);
 PERFORM pg_advisory_xact_lock(hashtextextended('product-member-parent:'||org||':'||first_member,0));
 IF second_member<>first_member THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('product-member-parent:'||org||':'||second_member,0));
 END IF;
 SELECT m.status INTO actor_status FROM public.memberships m
   WHERE m.organization_id=org AND m.id=actor_member AND m.user_id=actor;
 SELECT m.status INTO target_status FROM public.memberships m
   WHERE m.organization_id=org AND m.id=target_member;
 SELECT u.status INTO user_status FROM public.users u WHERE u.id=actor FOR SHARE;
 IF actor_status IS DISTINCT FROM 'active' OR target_status IS DISTINCT FROM 'active'
   OR user_status IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Member request actor or target unavailable' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION company_human_private.lock_member_request_context(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_human_private.lock_member_request_context(text,text,text) TO company_human_service;
GRANT CREATE ON SCHEMA company_human_private TO company_human_identity_offboarding;
ALTER FUNCTION company_human_private.lock_member_request_context(text,text,text) OWNER TO company_human_identity_offboarding;
REVOKE CREATE ON SCHEMA company_human_private FROM company_human_identity_offboarding;

-- Lock catalog, tenant authorization and organization status before either
-- member parent. The VOLATILE policy rechecks every fact after any wait.
CREATE FUNCTION company_human_private.lock_member_request_authority()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE product text; current_product text; actor_member text;
BEGIN
 SELECT i.product_id INTO product FROM public.product_instances i
  WHERE i.organization_id=NEW.organization_id AND i.id=NEW.product_instance_id;
 IF product IS NULL THEN
   RAISE EXCEPTION 'Product instance unavailable for member request' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('product-catalog-access:'||product,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('product-authorization:'||NEW.organization_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('organization-access:'||NEW.organization_id,0));
 SELECT i.product_id INTO current_product FROM public.product_instances i
  WHERE i.organization_id=NEW.organization_id AND i.id=NEW.product_instance_id;
 IF current_product IS DISTINCT FROM product THEN
   RAISE EXCEPTION 'Product instance changed during member request' USING ERRCODE='42501';
 END IF;
 IF pg_has_role(session_user,'company_human_service','member')
   AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN
  SELECT m.id INTO actor_member FROM public.memberships m
   WHERE m.organization_id=NEW.organization_id
     AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'');
  PERFORM company_human_private.lock_member_request_context(NEW.organization_id,actor_member,NEW.membership_id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION company_human_private.lock_member_request_authority() FROM PUBLIC;
-- Alphabetical trigger execution precedes product_identity_lock,
-- product_membership_parent_lock and product_membership_z_instance_lock.
CREATE TRIGGER product_access_request_lock BEFORE INSERT ON public.product_memberships
 FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_member_request_authority();
