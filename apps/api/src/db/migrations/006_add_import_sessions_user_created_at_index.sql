CREATE INDEX IF NOT EXISTS idx_transaction_import_sessions_user_created_at_desc
  ON transaction_import_sessions (user_id, created_at DESC);
