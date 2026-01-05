-- Create payment_transactions table for complete payment audit trail
CREATE TABLE IF NOT EXISTS payment_transactions (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('payment', 'refund', 'adjustment')),
    method VARCHAR(50),
    recorded_by VARCHAR(255) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries by booking_id
CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking_id ON payment_transactions(booking_id);

-- Add comment
COMMENT ON TABLE payment_transactions IS 'Complete audit trail of all payment transactions including payments, refunds, and adjustments';

