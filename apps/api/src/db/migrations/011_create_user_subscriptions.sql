CREATE TABLE IF NOT EXISTS subscriptions (
  id                      SERIAL PRIMARY KEY,
  user_id                 INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                 INTEGER     NOT NULL REFERENCES plans(id),
  status                  VARCHAR(20) NOT NULL DEFAULT 'active',
  stripe_customer_id      VARCHAR(100),
  stripe_subscription_id  VARCHAR(100),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce at most one active/trialing/past_due subscription per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_active
  ON subscriptions (user_id)
  WHERE status IN ('active', 'trialing', 'past_due');

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON subscriptions (user_id);
