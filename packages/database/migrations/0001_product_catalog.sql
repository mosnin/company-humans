CREATE TABLE products (
  id text PRIMARY KEY CHECK (id ~ '^ch_prod_[0-9a-f]{32}$'),
  product_key text NOT NULL UNIQUE CHECK (product_key ~ '^[a-z][a-z0-9-]*$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
