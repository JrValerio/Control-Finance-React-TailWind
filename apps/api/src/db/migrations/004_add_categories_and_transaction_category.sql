CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_categories_user_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_name_unique
  ON categories (user_id, LOWER(name));

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_transactions_user_category_date_id;

CREATE INDEX IF NOT EXISTS idx_transactions_user_category_date_id
  ON transactions (user_id, category_id, date DESC, id);
