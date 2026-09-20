-- Explicit product-owner decision: Convex OAuth replaces Clerk authentication.
-- Preserve every canonical ID and historical legacy identity; never link by email.
ALTER TABLE users RENAME COLUMN clerk_user_id TO auth_subject;
ALTER TABLE users DROP CONSTRAINT users_clerk_user_id_check;
ALTER TABLE users DROP CONSTRAINT users_clerk_user_id_key;
ALTER TABLE users ADD COLUMN auth_issuer text NOT NULL DEFAULT 'https://clerk.legacy.invalid';
ALTER TABLE users ALTER COLUMN auth_issuer DROP DEFAULT;
ALTER TABLE users ADD CONSTRAINT users_auth_subject_check CHECK (length(auth_subject) BETWEEN 1 AND 256);
ALTER TABLE users ADD CONSTRAINT users_auth_issuer_check CHECK (length(auth_issuer) > 0);
ALTER TABLE users ADD CONSTRAINT users_auth_identity_key UNIQUE (auth_issuer, auth_subject);
