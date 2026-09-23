-- 0064 is already checksummed on hosted verification. Keep it immutable and
-- narrow its trigger in an additive migration: privileged migration fixtures
-- without an application actor context must not execute the service-only
-- actor lock. Restricted service inserts still fail the existing RLS policy
-- without that context.
CREATE OR REPLACE FUNCTION company_human_private.lock_member_request_authority()
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
 IF NULLIF(current_setting('company_human.user_id',true),'') IS NOT NULL
   AND pg_has_role(session_user,'company_human_service','member')
   AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN
  SELECT m.id INTO actor_member FROM public.memberships m
   WHERE m.organization_id=NEW.organization_id
     AND m.user_id=NULLIF(current_setting('company_human.user_id',true),'');
  PERFORM company_human_private.lock_member_request_context(NEW.organization_id,actor_member,NEW.membership_id);
 END IF;
 RETURN NEW;
END $$;
