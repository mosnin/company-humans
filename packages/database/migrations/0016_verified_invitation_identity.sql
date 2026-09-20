-- Invitation redemption requires a fresh Clerk-verified email in server-only context.
CREATE OR REPLACE FUNCTION company_human_private.invitation_organization_for_actor(invitation_hash text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT i.organization_id FROM public.membership_invitations AS i
  JOIN public.users AS u ON u.id = NULLIF(pg_catalog.current_setting('company_human.user_id', true), '')
  JOIN public.organizations AS o ON o.id = i.organization_id
  WHERE i.token_hash = invitation_hash AND i.status = 'pending' AND i.expires_at > now()
    AND i.recipient_email = NULLIF(current_setting('company_human.verified_email', true), '')
    AND i.recipient_email = lower(u.primary_email) AND u.status = 'active' AND o.status = 'active'
  LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION company_human_private.invitation_matches(org text, recipient text, requested_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT recipient = NULLIF(current_setting('company_human.user_id', true), '') AND EXISTS (
    SELECT 1 FROM public.membership_invitations i JOIN public.users u ON u.id = recipient AND u.status = 'active'
    WHERE i.organization_id = org AND i.role_key = requested_role AND i.role_key <> 'owner'
      AND i.recipient_email = NULLIF(current_setting('company_human.verified_email', true), '')
      AND i.recipient_email = lower(u.primary_email) AND i.status = 'pending' AND i.expires_at > now()
      AND i.token_hash = NULLIF(current_setting('company_human.invitation_hash', true), '')
  );
$$;
