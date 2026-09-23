-- Row-locking SELECT also applies UPDATE policies, which deliberately prohibit
-- editing owner memberships. Use the same transaction advisory lock in both
-- parent-status transitions and child insertion, without expanding privileges.
CREATE FUNCTION company_human_private.lock_member_product_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('product-member-parent:'||OLD.organization_id||':'||OLD.id,0));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION company_human_private.lock_member_product_transition() FROM PUBLIC;
CREATE TRIGGER member_product_transition_lock BEFORE UPDATE OF status ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION company_human_private.lock_member_product_transition();
CREATE OR REPLACE FUNCTION company_human_private.lock_product_membership_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE member_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('product-member-parent:'||NEW.organization_id||':'||NEW.membership_id,0));
  SELECT status INTO member_status FROM public.memberships
    WHERE organization_id=NEW.organization_id AND id=NEW.membership_id;
  IF member_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Product membership parent is not active' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
