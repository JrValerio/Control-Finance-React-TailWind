CREATE TABLE IF NOT EXISTS user_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name   TEXT,
  salary_monthly NUMERIC(12, 2),
  payday         SMALLINT,
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_profiles_payday CHECK (payday IS NULL OR (payday >= 1 AND payday <= 31)),
  CONSTRAINT chk_user_profiles_salary CHECK (salary_monthly IS NULL OR salary_monthly >= 0)
);
