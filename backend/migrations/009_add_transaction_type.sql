-- Migration 009: Add transaction_type column to payment_transactions table
-- This separates transaction type (booking/exchange_upgrade/exchange_penalty) from payment method (Cash/UPI/Card)

-- Add transaction_type column
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50) DEFAULT 'booking';

-- Migrate existing data:
-- 1. Set exchange_penalty transactions
UPDATE payment_transactions 
SET transaction_type = 'exchange_penalty'
WHERE method = 'exchange_penalty';

-- 2. Set exchange_upgrade transactions  
UPDATE payment_transactions 
SET transaction_type = 'exchange_upgrade'
WHERE method = 'exchange_upgrade';

-- 3. Set exchange_downgrade transactions
UPDATE payment_transactions 
SET transaction_type = 'exchange_downgrade'
WHERE method = 'exchange_downgrade';

-- 4. Set exchange_lapsed transactions
UPDATE payment_transactions 
SET transaction_type = 'exchange_lapsed'
WHERE method = 'exchange_lapsed';

-- 5. Set cancellation_penalty transactions
UPDATE payment_transactions 
SET transaction_type = 'cancellation_penalty'
WHERE method = 'cancellation_penalty';

-- 6. For exchange transactions, extract payment method from notes
-- Pattern: "Payment Method: Cash" or "Payment Method: UPI" etc.
UPDATE payment_transactions 
SET method = CASE
    WHEN notes LIKE '%Payment Method: Cash%' THEN 'Cash'
    WHEN notes LIKE '%Payment Method: UPI%' THEN 'UPI'
    WHEN notes LIKE '%Payment Method: Card%' THEN 'Card'
    WHEN notes LIKE '%Payment Method: Bank Transfer%' THEN 'Bank Transfer'
    WHEN notes LIKE '%Payment Method: Cheque%' THEN 'Cheque'
    ELSE 'N/A'
END
WHERE transaction_type IN ('exchange_penalty', 'exchange_upgrade', 'exchange_downgrade', 'cancellation_penalty')
AND notes LIKE '%Payment Method:%';

-- 7. All other transactions default to 'booking'
UPDATE payment_transactions 
SET transaction_type = 'booking'
WHERE transaction_type IS NULL OR transaction_type = '';

-- Add comment
COMMENT ON COLUMN payment_transactions.transaction_type IS 'Type of transaction: booking (normal payment), exchange_upgrade, exchange_penalty, exchange_downgrade, exchange_lapsed, cancellation_penalty';

