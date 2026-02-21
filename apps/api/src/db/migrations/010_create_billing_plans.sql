CREATE TABLE IF NOT EXISTS plans (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(50)   NOT NULL UNIQUE,
  display_name    VARCHAR(100)  NOT NULL,
  price_cents     INTEGER       NOT NULL DEFAULT 0,
  stripe_price_id VARCHAR(100),
  features        JSONB         NOT NULL DEFAULT '{}',
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO plans (name, display_name, price_cents, features, is_active)
VALUES
  (
    'free',
    'Gratuito',
    0,
    '{"csv_import":false,"csv_export":false,"analytics_months_max":3,"budget_tracking":true}',
    true
  ),
  (
    'pro',
    'Pro',
    1990,
    '{"csv_import":true,"csv_export":true,"analytics_months_max":24,"budget_tracking":true}',
    true
  )
ON CONFLICT (name) DO NOTHING;
