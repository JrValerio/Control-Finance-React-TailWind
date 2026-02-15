CREATE INDEX IF NOT EXISTS idx_transactions_user_date_id
  ON transactions (user_id, date, id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date_id
  ON transactions (user_id, type, date, id);
