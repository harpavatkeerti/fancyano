-- Migration 046: Add approval workflow to recurring_expenses
-- Salesman-created recurring expenses need admin approval before they become effective.

ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_approval ON recurring_expenses(approval_status);
