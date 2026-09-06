-- Migration: Add payment_source column to expenses table
-- Tracks whether expense was paid from Shop Cash, Online, or Personal funds.
-- Only 'Shop Cash' expenses appear in the Financial Ledger.
-- All approved expenses (regardless of source) appear in P&L.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS payment_source VARCHAR(20) DEFAULT 'Shop Cash'
    CHECK (payment_source IN ('Shop Cash', 'Online', 'Personal'));

-- Backfill: existing expenses default to 'Shop Cash'
UPDATE expenses SET payment_source = 'Shop Cash' WHERE payment_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_payment_source ON expenses(payment_source);

COMMENT ON COLUMN expenses.payment_source IS 'Source of funds: Shop Cash (affects ledger), Online, or Personal';
