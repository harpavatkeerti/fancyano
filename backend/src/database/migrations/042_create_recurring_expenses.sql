-- Migration 042: Create recurring_expenses table
-- Supports monthly recurring expenses that auto-create expense entries

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT,
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly')),
  is_active BOOLEAN DEFAULT TRUE,
  next_due_date DATE NOT NULL,
  last_created_date DATE,           -- last time an expense was auto-created
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses (is_active, next_due_date);
