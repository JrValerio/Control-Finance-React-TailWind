CREATE INDEX IF NOT EXISTS idx_transactions_user_date_id_active
  ON transactions (user_id, date ASC, id ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date_id_active
  ON transactions (user_id, type, date ASC, id ASC)
  WHERE deleted_at IS NULL;
