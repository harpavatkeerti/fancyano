-- Add payment and security deposit fields to bookings

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_charges DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS early_pickup_charge DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS late_return_charge DECIMAL(10, 2) DEFAULT 0;

-- Add comment to explain the columns
COMMENT ON COLUMN bookings.security_deposit IS 'Security deposit amount collected from customer';
COMMENT ON COLUMN bookings.other_charges IS 'Any additional charges';
COMMENT ON COLUMN bookings.early_pickup_charge IS 'Charge for early pickup (calculated automatically)';
COMMENT ON COLUMN bookings.late_return_charge IS 'Charge for late return (calculated automatically)';

