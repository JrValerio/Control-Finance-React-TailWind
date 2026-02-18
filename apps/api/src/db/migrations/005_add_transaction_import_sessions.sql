CREATE TABLE IF NOT EXISTS transaction_import_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  committed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_import_sessions_user_expires
  ON transaction_import_sessions (user_id, expires_at);
