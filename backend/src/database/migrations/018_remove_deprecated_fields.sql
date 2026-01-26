-- ============================================
-- Migration: Remove Deprecated Fields
-- Description: Remove all deprecated fields that have been replaced by the new architecture
-- ============================================

BEGIN;

-- ============================================
-- 1. REMOVE DEPRECATED COLUMNS FROM BOOKINGS TABLE
-- ============================================

-- Remove deprecated financial tracking columns (replaced by product_charges + payment_transactions)
ALTER TABLE bookings DROP COLUMN IF EXISTS total_amount;
ALTER TABLE bookings DROP COLUMN IF EXISTS paid_amount;
ALTER TABLE bookings DROP COLUMN IF EXISTS due_amount;
ALTER TABLE bookings DROP COLUMN IF EXISTS payment_status;
ALTER TABLE bookings DROP COLUMN IF EXISTS payment_method;

-- Remove old transportation field (replaced by transport_opted)
ALTER TABLE bookings DROP COLUMN IF EXISTS transportation_opted;

-- ============================================
-- 2. REMOVE DEPRECATED COLUMNS FROM BOOKING_PRODUCTS TABLE (if any)
-- ============================================

-- Remove old rent_per_day if it exists (replaced by rent)
ALTER TABLE booking_products DROP COLUMN IF EXISTS rent_per_day;

-- ============================================
-- 3. REMOVE DEPRECATED COLUMNS FROM PRODUCTS TABLE
-- ============================================

-- Remove old rent_per_day (replaced by rent)
ALTER TABLE products DROP COLUMN IF EXISTS rent_per_day;

-- Remove old rental_policy if it exists (replaced by rental_policies table)
ALTER TABLE products DROP COLUMN IF EXISTS rental_policy;

COMMIT;
