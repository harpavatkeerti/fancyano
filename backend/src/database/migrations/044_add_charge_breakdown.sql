-- Migration 044: Replace charge_category with charge_breakdown JSONB
-- charge_category was a VARCHAR(30) that was never populated.
-- charge_breakdown stores a JSONB object with category → amount pairs,
-- e.g. {"rent": 5000, "security": 2000}

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS charge_breakdown JSONB DEFAULT NULL;

ALTER TABLE payment_transactions
  DROP COLUMN IF EXISTS charge_category;

COMMENT ON COLUMN payment_transactions.charge_breakdown IS 'JSONB breakdown of how this payment was applied across charge categories, e.g. {"rent": 5000, "security": 2000}';
