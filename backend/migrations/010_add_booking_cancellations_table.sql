-- Migration to add booking_cancellations table for tracking cancellation details
-- This table stores cancellation information including extra refund and notes

CREATE TABLE IF NOT EXISTS booking_cancellations (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
    cancelled_products JSONB NOT NULL, -- Array of {product_id, code, name, rent, security, penalty}
    total_rent DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Sum of rent for cancelled products
    total_security DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Sum of security for cancelled products
    total_penalty DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Sum of penalties
    extra_refund DECIMAL(10, 2) DEFAULT 0, -- Additional refund amount
    extra_refund_note TEXT, -- Reason/note for extra refund
    refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Final refund amount (rent + security - penalty + extra_refund)
    cancellation_reason TEXT,
    cancelled_by VARCHAR(255),
    cancellation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_booking_cancellations_booking ON booking_cancellations(booking_id);

-- Add comment to table
COMMENT ON TABLE booking_cancellations IS 'Tracks booking cancellation history with detailed breakdown of refunds';
COMMENT ON COLUMN booking_cancellations.extra_refund IS 'Optional additional refund amount beyond calculated refund';
COMMENT ON COLUMN booking_cancellations.refund_amount IS 'Final refund = (rent + security - penalty + extra_refund) for cancelled products only';

