-- Clean up booking_products for cancelled and completed bookings
-- This fixes the issue where products remain blocked after cancellation or completion

-- First, let's see what we're about to clean up
SELECT 
    b.id as booking_id,
    b.status,
    b.customer_name,
    bp.product_id,
    p.code as product_code,
    p.name as product_name,
    bp.booked_from,
    bp.booked_to
FROM bookings b
JOIN booking_products bp ON b.id = bp.booking_id
JOIN products p ON bp.product_id = p.id
WHERE b.status IN ('cancelled', 'completed')
ORDER BY b.id;

-- Now delete all products from cancelled and completed bookings
-- This will free up the dates for other bookings
DELETE FROM booking_products
WHERE booking_id IN (
    SELECT id FROM bookings WHERE status IN ('cancelled', 'completed')
);

-- Verify cleanup - should return 0 rows
SELECT 
    b.id as booking_id,
    b.status,
    COUNT(bp.product_id) as products_still_blocked
FROM bookings b
LEFT JOIN booking_products bp ON b.id = bp.booking_id
WHERE b.status IN ('cancelled', 'completed')
GROUP BY b.id, b.status
HAVING COUNT(bp.product_id) > 0;

-- Show summary
SELECT 
    'Cancelled and completed bookings cleaned up successfully!' as message,
    COUNT(DISTINCT CASE WHEN status = 'cancelled' THEN id END) as cancelled_bookings,
    COUNT(DISTINCT CASE WHEN status = 'completed' THEN id END) as completed_bookings
FROM bookings
WHERE status IN ('cancelled', 'completed');

