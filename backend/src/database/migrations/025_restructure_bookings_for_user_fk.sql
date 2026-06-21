-- Migration 025: Restructure bookings to use user_id FK
-- Part 2 of Step 1: Users as First-Class Entity

-- 1. Clear all bookings data (agreed — development only)
--    Cascades to: booking_products, product_charges, booking_activity_log,
--                 payment_transactions, product_exchanges, booking_cancellations, credit_notes
TRUNCATE bookings CASCADE;

-- 2. Add user_id FK column (nullable first so we can set NOT NULL after truncate)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;

-- 3. Make it NOT NULL (safe after truncate — no existing rows to violate)
ALTER TABLE bookings ALTER COLUMN user_id SET NOT NULL;

-- 4. Drop old customer columns (no longer needed — data lives in users)
ALTER TABLE bookings DROP COLUMN IF EXISTS customer_name;
ALTER TABLE bookings DROP COLUMN IF EXISTS customer_phone;
ALTER TABLE bookings DROP COLUMN IF EXISTS customer_email;
ALTER TABLE bookings DROP COLUMN IF EXISTS customer_address;
ALTER TABLE bookings DROP COLUMN IF EXISTS alternate_phone;

-- 5. Index for fast lookups by user
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON bookings(user_id);
