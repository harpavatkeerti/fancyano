-- Add payment tracking columns to bookings table

-- Add paid_amount column (default 0)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10, 2) DEFAULT 0;

-- Add due_amount column (initially same as total_amount)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS due_amount DECIMAL(10, 2);

-- Add payment_status column
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid' 
CHECK (payment_status IN ('unpaid', 'partial', 'paid'));

-- Update existing records: set due_amount = total_amount for existing bookings
UPDATE bookings 
SET due_amount = total_amount 
WHERE due_amount IS NULL;

-- Update existing records: set payment_status based on paid_amount
UPDATE bookings 
SET payment_status = CASE 
    WHEN paid_amount >= total_amount THEN 'paid'
    WHEN paid_amount > 0 THEN 'partial'
    ELSE 'unpaid'
END
WHERE payment_status = 'unpaid' OR payment_status IS NULL;

