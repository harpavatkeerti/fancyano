-- ==============================================================================
-- Fix Booking ID 175 Status
-- ==============================================================================
-- This script checks if all products in booking 175 are cancelled and updates
-- the booking status to 'cancelled' if they are.
--
-- INSTRUCTIONS:
-- 1. Open pgAdmin
-- 2. Connect to your 'rentals' database
-- 3. Open a new Query Tool
-- 4. Copy and paste this ENTIRE script
-- 5. Execute it (F5 or click the Execute button)
-- ==============================================================================

-- Step 1: Check current status
SELECT 
  b.id as booking_id,
  b.status as booking_status,
  b.customer_name,
  COUNT(bp.*) as total_products,
  COUNT(bp.*) FILTER (WHERE bp.status = 'cancelled') as cancelled_products,
  COUNT(bp.*) FILTER (WHERE bp.status = 'active') as active_products
FROM bookings b
LEFT JOIN booking_products bp ON b.id = bp.booking_id
WHERE b.id = 175
GROUP BY b.id, b.status, b.customer_name;

-- Step 2: Update booking status to 'cancelled' if all products are cancelled
UPDATE bookings 
SET 
  status = 'cancelled',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 175
  AND (
    -- Only update if ALL products are cancelled
    SELECT COUNT(*) 
    FROM booking_products 
    WHERE booking_id = 175 AND status = 'active'
  ) = 0
  AND (
    -- And there is at least one product
    SELECT COUNT(*) 
    FROM booking_products 
    WHERE booking_id = 175
  ) > 0;

-- Step 3: Verify the update
SELECT 
  b.id as booking_id,
  b.status as booking_status,
  b.customer_name,
  COUNT(bp.*) as total_products,
  COUNT(bp.*) FILTER (WHERE bp.status = 'cancelled') as cancelled_products,
  COUNT(bp.*) FILTER (WHERE bp.status = 'active') as active_products
FROM bookings b
LEFT JOIN booking_products bp ON b.id = bp.booking_id
WHERE b.id = 175
GROUP BY b.id, b.status, b.customer_name;

-- ==============================================================================
-- Expected Result:
-- booking_status should be 'cancelled' if all products are cancelled
-- ==============================================================================

