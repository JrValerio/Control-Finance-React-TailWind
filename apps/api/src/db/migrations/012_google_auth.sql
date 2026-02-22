-- Allow users created via OAuth providers to have no password
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Track external identity provider accounts (enables multiple providers per user)
CREATE TABLE IF NOT EXISTS user_identities (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities (user_id);
