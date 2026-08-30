-- Migration: Add approval workflow to expenses table.
-- Non-admin users create expenses as 'pending'; admin approval required.
-- Mirrors the cash_adjustments approval pattern.

-- Add approval columns (non-destructive: existing rows default to 'approved')
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_expenses_approval_status ON expenses(approval_status);
