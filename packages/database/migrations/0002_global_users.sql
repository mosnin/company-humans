CREATE TABLE users (
  id text PRIMARY KEY CHECK (id ~ '^ch_usr_[0-9a-f]{32}$'),
  clerk_user_id text NOT NULL UNIQUE CHECK (clerk_user_id ~ '^user_[A-Za-z0-9]+$'),
  primary_email text,
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  status text NOT NULL CHECK (status IN ('active', 'deleted')),
  provider_event_timestamp bigint NOT NULL CHECK (provider_event_timestamp >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_status_idx ON users (status);
