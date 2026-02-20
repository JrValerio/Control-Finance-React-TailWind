ALTER TABLE categories
ADD COLUMN IF NOT EXISTS normalized_name TEXT;

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE categories
SET
  normalized_name = lower(name)
WHERE normalized_name IS NULL OR normalized_name = '';

ALTER TABLE categories
ALTER COLUMN normalized_name SET NOT NULL;

DROP INDEX IF EXISTS idx_categories_user_name_unique;

DROP INDEX IF EXISTS idx_categories_user_normalized_active_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_normalized_active_unique
  ON categories (user_id, normalized_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_categories_user_deleted_normalized_name
  ON categories (user_id, deleted_at, normalized_name, id);
