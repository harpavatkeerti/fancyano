-- COMBINED MIGRATION: Fix cancellation system
-- Run this in pgAdmin to enable partial cancellations and track cancelled products

-- ========================================
-- PART 1: Add 'partially_cancelled' status to bookings table
-- ========================================

-- Drop the existing check constraint
ALTER TABLE bookings 
DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Add the updated check constraint with 'partially_cancelled'
ALTER TABLE bookings 
ADD CONSTRAINT bookings_status_check 
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'partially_cancelled'));

-- Add comment
COMMENT ON CONSTRAINT bookings_status_check ON bookings IS 'Valid booking statuses including partially_cancelled for partial product cancellations';


-- ========================================
-- PART 2: Add status column to booking_products table
-- ========================================

-- Add status column with default 'active'
ALTER TABLE booking_products 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' 
CHECK (status IN ('active', 'cancelled', 'exchanged'));

-- Update existing rows to have 'active' status
UPDATE booking_products 
SET status = 'active' 
WHERE status IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_booking_products_status ON booking_products(status);

-- Add comment
COMMENT ON COLUMN booking_products.status IS 'Status of product in booking: active, cancelled, or exchanged';

-- ========================================
-- DONE! Migrations completed successfully.
-- ========================================

