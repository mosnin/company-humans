-- Access table-specific record fields only inside the matching branch.
CREATE OR REPLACE FUNCTION company_human_private.guard_service_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE allowed text[];
BEGIN
  IF NOT pg_has_role(current_user, 'company_human_service', 'member') THEN RETURN NEW; END IF;
  allowed := CASE TG_TABLE_NAME
    WHEN 'organizations' THEN ARRAY['name','updated_at']
    WHEN 'memberships' THEN ARRAY['role_id','role_key','status','joined_at','suspended_at','updated_at']
    WHEN 'teams' THEN ARRAY['name','status','updated_at']
    WHEN 'team_memberships' THEN ARRAY['team_role','ended_at']
    WHEN 'membership_invitations' THEN ARRAY['status','accepted_by_user_id','accepted_at','revoked_at']
    WHEN 'product_instances' THEN ARRAY['desired_enabled','provisioning_status','updated_at']
    ELSE ARRAY[]::text[] END;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Immutable identity or provider fields' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'membership_invitations' THEN
    IF NEW.status = 'accepted' THEN
    IF OLD.status <> 'pending' OR OLD.expires_at <= now()
      OR NOT company_human_private.invitation_matches(OLD.organization_id, NEW.accepted_by_user_id, OLD.role_key) THEN
      RAISE EXCEPTION 'Invitation acceptance denied' USING ERRCODE = '42501';
    END IF;
  END IF;
  END IF;
  RETURN NEW;
END;
$$;
