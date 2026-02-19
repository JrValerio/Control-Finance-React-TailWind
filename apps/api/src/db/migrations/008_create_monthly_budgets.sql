CREATE TABLE IF NOT EXISTS monthly_budgets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_budgets_user_category_month_unique
  ON monthly_budgets (user_id, category_id, month);

CREATE INDEX IF NOT EXISTS idx_monthly_budgets_user_month
  ON monthly_budgets (user_id, month);
