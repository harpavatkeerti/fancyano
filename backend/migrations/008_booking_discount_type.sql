-- Add booking_discount type to payment_transactions

-- Update type constraint to include booking_discount
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_type_check;
ALTER TABLE payment_transactions 
  ALTER COLUMN type TYPE VARCHAR(30);
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_type_check 
    CHECK (type IN ('payment', 'refund', 'adjustment', 'booking_discount'));

-- Drop strict method constraint (allow any method value including 'discount')
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_method_check;
