-- Add status column to booking_products table
-- This allows tracking product state without deleting records

-- Add status column with default 'active'
ALTER TABLE booking_products 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

-- Add comment for documentation
COMMENT ON COLUMN booking_products.status IS 'Product status in booking: active, cancelled, exchanged';

-- Update existing records to 'active'
UPDATE booking_products 
SET status = 'active' 
WHERE status IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_booking_products_status 
ON booking_products(status);

-- Create index for combined booking_id + status queries
CREATE INDEX IF NOT EXISTS idx_booking_products_booking_status 
ON booking_products(booking_id, status);

COMMENT ON TABLE booking_products IS 'Junction table for bookings and products with individual dates and status tracking';

