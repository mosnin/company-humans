CREATE TABLE organizations (
  id text PRIMARY KEY CHECK (id ~ '^ch_org_[0-9a-f]{32}$'),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,62}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 256),
  owner_user_id text NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  billing_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organizations_owner_idx ON organizations (owner_user_id);

CREATE TABLE memberships (
  id text PRIMARY KEY CHECK (id ~ '^ch_mem_[0-9a-f]{32}$'),
  organization_id text NOT NULL REFERENCES organizations(id),
  user_id text NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  role_key text NOT NULL CHECK (role_key IN ('owner', 'admin', 'manager', 'contributor', 'finance', 'developer')),
  sponsor_type text NOT NULL DEFAULT 'organization' CHECK (sponsor_type IN ('organization', 'self')),
  joined_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, id)
);
CREATE INDEX memberships_user_status_idx ON memberships (user_id, status);
CREATE INDEX memberships_org_status_idx ON memberships (organization_id, status);
