-- Migration: Create booking_cancellations table
-- This table stores records of booking cancellations (full or partial)

CREATE TABLE IF NOT EXISTS booking_cancellations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  cancelled_products JSONB NOT NULL,  -- Array of cancelled products with details
  total_rent DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- Total rent refunded/affected
  total_security DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- Total security refunded/affected
  total_penalty DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- Total penalty charged
  extra_refund DECIMAL(10, 2) DEFAULT 0,  -- Extra refund amount (goodwill, compensation, etc.)
  extra_refund_note TEXT,  -- Note for extra refund
  refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- Final refund amount (rent + security - penalty + extra)
  cancellation_reason TEXT,  -- Reason for cancellation
  cancelled_by VARCHAR(255) NOT NULL,  -- Who cancelled (admin/salesman name or 'system')
  cancellation_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- When cancellation was made
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on booking_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_booking_cancellations_booking_id ON booking_cancellations(booking_id);

-- Create index on cancellation_date for reporting
CREATE INDEX IF NOT EXISTS idx_booking_cancellations_date ON booking_cancellations(cancellation_date);

-- Add comment to table
COMMENT ON TABLE booking_cancellations IS 'Stores records of booking cancellations (full or partial) with refund details';

