-- ============================================
-- CLEANUP: Remove ALL Cancellation Penalty Transactions
-- ============================================
-- These penalty transactions were incorrectly created as separate transactions
-- The penalty is already accounted for in the reduced refund amount
-- Having both causes double-counting (overpayment issues)

-- Step 1: Show all cancellation penalty transactions that will be deleted
SELECT 
  id,
  booking_id,
  amount,
  type,
  transaction_type,
  substring(notes, 1, 60) as notes_preview,
  created_at
FROM payment_transactions 
WHERE transaction_type = 'cancellation_penalty'
ORDER BY booking_id, id;

-- Step 2: Delete ALL cancellation penalty transactions
DELETE FROM payment_transactions 
WHERE transaction_type = 'cancellation_penalty';

-- Step 3: Verify they're gone - this should return 0 rows
SELECT COUNT(*) as remaining_penalty_transactions
FROM payment_transactions 
WHERE transaction_type = 'cancellation_penalty';

-- Step 4: Show remaining transactions for affected bookings (for verification)
-- Adjust the booking IDs as needed
SELECT 
  booking_id,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_payments,
  SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) as total_refunds
FROM payment_transactions 
WHERE booking_id IN (184, 185) -- Add more booking IDs if needed
GROUP BY booking_id
ORDER BY booking_id;

