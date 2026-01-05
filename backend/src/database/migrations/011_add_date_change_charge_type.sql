-- Migration: Add 'date_change_charge' transaction type
-- This type is used for date modification charges and does NOT affect payment calculations

-- Drop the existing check constraint
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_type_check;

-- Add the new constraint with 'date_change_charge' included
ALTER TABLE payment_transactions 
ADD CONSTRAINT payment_transactions_type_check 
CHECK (type IN ('payment', 'refund', 'adjustment', 'date_change_charge'));

