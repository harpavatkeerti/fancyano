-- Migration: Add 'partially_cancelled' status to bookings table
-- This allows bookings with some products cancelled but not all

-- Drop the existing check constraint
ALTER TABLE bookings 
DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Add the updated check constraint with 'partially_cancelled'
ALTER TABLE bookings 
ADD CONSTRAINT bookings_status_check 
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'partially_cancelled'));

-- Add comment
COMMENT ON CONSTRAINT bookings_status_check ON bookings IS 'Valid booking statuses including partially_cancelled for partial product cancellations';

