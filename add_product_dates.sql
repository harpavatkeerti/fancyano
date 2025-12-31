-- Add individual date columns to booking_products table
ALTER TABLE booking_products 
ADD COLUMN IF NOT EXISTS booked_from DATE,
ADD COLUMN IF NOT EXISTS booked_to DATE;

-- Add comment
COMMENT ON COLUMN booking_products.booked_from IS 'Individual pickup date for this product';
COMMENT ON COLUMN booking_products.booked_to IS 'Individual return date for this product';

