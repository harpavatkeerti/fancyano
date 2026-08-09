-- Migration: Add 'discarded' status to bookings and booking_products
-- This is an admin-only override status for discarding bookings without financial checks.

BEGIN;

-- 1. Drop and recreate bookings status constraint to include 'discarded'
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings 
ADD CONSTRAINT bookings_status_check 
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'partially_completed', 'discarded'));

COMMENT ON CONSTRAINT bookings_status_check ON bookings IS 'Valid booking statuses including discarded for admin override discard';

-- 2. Drop and recreate booking_products status constraints to include 'discarded'
--    Note: There are TWO status constraints on booking_products: the original 'chk_product_status'
--    from schema.sql and the newer 'booking_products_status_check' from a later migration.
ALTER TABLE booking_products DROP CONSTRAINT IF EXISTS chk_product_status;
ALTER TABLE booking_products
ADD CONSTRAINT chk_product_status
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'exchanged', 'cancelled', 'discarded'));

ALTER TABLE booking_products DROP CONSTRAINT IF EXISTS booking_products_status_check;
ALTER TABLE booking_products 
ADD CONSTRAINT booking_products_status_check 
CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'exchanged', 'cancelled', 'discarded'));

COMMENT ON CONSTRAINT booking_products_status_check ON booking_products IS 'Valid booking product statuses including discarded for admin override discard';

COMMIT;
