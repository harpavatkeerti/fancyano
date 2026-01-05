-- Add created_by field to track who created the booking (salesman name or 'customer')
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- Add comment
COMMENT ON COLUMN bookings.created_by IS 'Name of the person who created the booking (salesman name or null for customer bookings)';

