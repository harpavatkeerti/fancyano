-- Migration 054: Add payment_source to recurring_expenses
-- Allows recurring expenses to specify which payment source (Shop Cash, Online, Personal)
-- so that auto-created expense entries inherit the correct source.

ALTER TABLE recurring_expenses
ADD COLUMN IF NOT EXISTS payment_source VARCHAR(20) NOT NULL DEFAULT 'Shop Cash'
CHECK (payment_source IN ('Shop Cash', 'Online', 'Personal'));
