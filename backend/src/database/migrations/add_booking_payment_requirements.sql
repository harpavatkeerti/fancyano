-- Migration: Add payment, special requirements, and measurements to bookings table

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS due_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
ADD COLUMN IF NOT EXISTS transportation_opted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS special_requirements TEXT,
ADD COLUMN IF NOT EXISTS measurements JSONB;

-- Add comment to explain the columns
COMMENT ON COLUMN bookings.paid_amount IS 'Amount already paid by customer';
COMMENT ON COLUMN bookings.due_amount IS 'Remaining amount to be paid (can be auto-calculated)';
COMMENT ON COLUMN bookings.payment_method IS 'Payment method used: Cash, Card, UPI, etc.';
COMMENT ON COLUMN bookings.payment_status IS 'Payment status: unpaid, partial, or paid';
COMMENT ON COLUMN bookings.transportation_opted IS 'Whether customer opted for transportation service';
COMMENT ON COLUMN bookings.special_requirements IS 'Any special requirements or notes for the booking';
COMMENT ON COLUMN bookings.measurements IS 'Customer measurements as JSON (chest, waist, height, etc.)';

-- Update existing bookings to have consistent data
UPDATE bookings 
SET due_amount = COALESCE(total_amount, 0) - COALESCE(paid_amount, 0)
WHERE due_amount IS NULL;

