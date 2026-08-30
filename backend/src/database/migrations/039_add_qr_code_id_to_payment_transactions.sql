-- Migration: Add qr_code_id column to payment_transactions.
-- This is the ONLY change to payment_transactions — a nullable FK for QR tracking.
-- No existing data is modified.

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS qr_code_id INTEGER REFERENCES qr_codes(id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_qr_code ON payment_transactions(qr_code_id);

COMMENT ON COLUMN payment_transactions.qr_code_id IS 'Optional link to QR code used for this payment';
