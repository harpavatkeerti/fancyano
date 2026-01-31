-- Migration: Rename 'partially_cancelled' status to 'partially_completed'
-- This makes semantic sense as it represents bookings where some products are completed/returned

BEGIN;

-- 1. Update existing bookings with partially_cancelled status
UPDATE bookings 
SET status = 'partially_completed' 
WHERE status = 'partially_cancelled';

-- 2. Drop the old constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

-- 3. Add the updated check constraint with 'partially_completed' instead of 'partially_cancelled'
ALTER TABLE bookings 
ADD CONSTRAINT bookings_status_check 
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'partially_completed'));

-- 4. Update constraint comment
COMMENT ON CONSTRAINT bookings_status_check ON bookings IS 'Valid booking statuses including partially_completed for when some products are returned/completed';

COMMIT;
