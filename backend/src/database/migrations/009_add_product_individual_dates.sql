-- Add individual booking dates for each product
-- This allows products in the same booking to have different pickup and return dates

ALTER TABLE booking_products 
ADD COLUMN IF NOT EXISTS booked_from DATE,
ADD COLUMN IF NOT EXISTS booked_to DATE;

-- Add comment to explain the columns
COMMENT ON COLUMN booking_products.booked_from IS 'Individual pickup date for this product (overrides booking.booked_from if set)';
COMMENT ON COLUMN booking_products.booked_to IS 'Individual return date for this product (overrides booking.booked_to if set)';

-- Note: If these columns are NULL, the product uses the booking-level dates (booking.booked_from and booking.booked_to)

