-- Validate attribution against historical canonical membership without giving the
-- ingestion login SELECT access to users or memberships. Suspended/removed
-- memberships remain valid references for delayed reports.
ALTER TABLE public.memberships ADD CONSTRAINT memberships_org_id_user_unique
  UNIQUE (organization_id,id,user_id);
ALTER TABLE public.usage_events ADD COLUMN actor_user_id text
  GENERATED ALWAYS AS (CASE WHEN envelope #>> '{actor,type}' = 'human'
    THEN envelope #>> '{actor,userId}' ELSE NULL END) STORED;
ALTER TABLE public.usage_events ADD CONSTRAINT usage_human_attribution_consistent
  CHECK (envelope #>> '{actor,type}' IS DISTINCT FROM 'human' OR COALESCE(
    membership_id IS NOT NULL
    AND actor_user_id ~ '^ch_usr_[0-9a-f]{32}$'
    AND envelope #>> '{actor,membershipId}' = membership_id
    AND envelope #>> '{payload,membershipId}' = membership_id, false));
ALTER TABLE public.usage_events ADD CONSTRAINT usage_human_membership_fk
  FOREIGN KEY (organization_id,membership_id,actor_user_id)
  REFERENCES public.memberships(organization_id,id,user_id);
