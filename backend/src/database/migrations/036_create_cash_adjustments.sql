-- Migration: Create cash_adjustments table for standalone cash tally adjustments
-- These are store-level operational entries, NOT booking-level transactions.
-- Kept separate from payment_transactions per design decision.

CREATE TABLE IF NOT EXISTS cash_adjustments (
  id SERIAL PRIMARY KEY,
  amount INTEGER NOT NULL,                                -- positive = surplus, negative = shortage
  reason TEXT NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approval_status VARCHAR(20) DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  recorded_by VARCHAR(100) NOT NULL,
  approved_by VARCHAR(100),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_adjustments_date ON cash_adjustments(adjustment_date);
CREATE INDEX IF NOT EXISTS idx_cash_adjustments_status ON cash_adjustments(approval_status);

COMMENT ON TABLE cash_adjustments IS 'Standalone cash tally adjustments — separate from booking payment_transactions';
