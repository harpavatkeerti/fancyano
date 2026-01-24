-- Migration: New Architecture - Complete Financial Tracking System
-- Note: All trigger logic moved to backend APIs for better maintainability

-- ============================================
-- 1. MODIFY BOOKINGS TABLE
-- ============================================

-- Drop old constraints if they exist (to allow redefining them)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_overpayment;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_transport_paid;

-- Make old date columns nullable (no longer used - dates are per-product now)
ALTER TABLE bookings ALTER COLUMN booked_from DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN booked_to DROP NOT NULL;

-- Add new financial tracking fields (skip existing)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS transport_charge INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS transport_paid INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_discount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS overpayment INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);

-- Add constraints with new definitions
ALTER TABLE bookings ADD CONSTRAINT chk_overpayment 
  CHECK (overpayment >= 0);

ALTER TABLE bookings ADD CONSTRAINT chk_transport_paid 
  CHECK (transport_paid >= 0 AND transport_paid <= transport_charge);

-- Mark old fields as deprecated (keep for migration, remove later)
COMMENT ON COLUMN bookings.total_amount IS 'DEPRECATED: Use product_charges table';
COMMENT ON COLUMN bookings.paid_amount IS 'DEPRECATED: Use product_charges table';
COMMENT ON COLUMN bookings.payment_method IS 'DEPRECATED: Use payment_transactions table';
COMMENT ON COLUMN bookings.payment_status IS 'DEPRECATED: Calculate from charges';

-- ============================================
-- 2. MODIFY BOOKING_PRODUCTS TABLE
-- ============================================

-- Drop old constraints if they exist (to allow redefining them)
ALTER TABLE booking_products DROP CONSTRAINT IF EXISTS chk_product_dates;
ALTER TABLE booking_products DROP CONSTRAINT IF EXISTS chk_rent_values;
ALTER TABLE booking_products DROP CONSTRAINT IF EXISTS chk_product_discount;
ALTER TABLE booking_products DROP CONSTRAINT IF EXISTS chk_product_status;

-- Ensure status column exists and has correct type/constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_products' AND column_name = 'status'
  ) THEN
    ALTER TABLE booking_products ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
  ELSE
    -- Alter existing column to ensure correct type
    ALTER TABLE booking_products ALTER COLUMN status TYPE VARCHAR(20);
    ALTER TABLE booking_products ALTER COLUMN status SET DEFAULT 'pending';
  END IF;
END $$;

-- Migrate old status values to new ones
UPDATE booking_products 
SET status = CASE 
  WHEN status = 'active' THEN 'confirmed'
  WHEN status IN ('pending', 'confirmed', 'in_progress', 'completed', 'exchanged', 'cancelled') THEN status
  ELSE 'confirmed'  -- Default fallback for any other values
END
WHERE status NOT IN ('pending', 'confirmed', 'in_progress', 'completed', 'exchanged', 'cancelled');

-- Add status constraint
ALTER TABLE booking_products ADD CONSTRAINT chk_product_status 
  CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'exchanged', 'cancelled'));

-- Add other columns (skip existing)
ALTER TABLE booking_products
ADD COLUMN IF NOT EXISTS rent INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS security_deposit INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS effective_rent INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS picked_up_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS returned_to VARCHAR(100),
ADD COLUMN IF NOT EXISTS exchanged_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS exchanged_for_product_ids JSONB,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS measurements JSONB,
ADD COLUMN IF NOT EXISTS special_requirements TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add constraints with new definitions
ALTER TABLE booking_products ADD CONSTRAINT chk_product_dates 
  CHECK (booked_to >= booked_from);

ALTER TABLE booking_products ADD CONSTRAINT chk_rent_values 
  CHECK (rent >= 0 AND effective_rent >= 0);

ALTER TABLE booking_products ADD CONSTRAINT chk_product_discount 
  CHECK (
    (discount_type IS NULL AND discount_amount = 0) OR
    (discount_type IS NOT NULL AND discount_amount >= 0)
  );

-- ============================================
-- 3. CREATE NEW TABLES (IF NOT EXISTS)
-- ============================================

-- Product-level charge tracking (7 charge types)
CREATE TABLE IF NOT EXISTS product_charges (
  id SERIAL PRIMARY KEY,
  booking_product_id INTEGER NOT NULL REFERENCES booking_products(id) ON DELETE CASCADE,
  charge_type VARCHAR(30) NOT NULL CHECK (charge_type IN (
    'rent', 'exchange_penalty', 'downgrade_penalty', 
    'cancellation_penalty', 'late_fee', 'damage_fee', 'security'
  )),
  due_amount INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  policy_reference VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_product_charge UNIQUE (booking_product_id, charge_type),
  CONSTRAINT chk_charge_amounts CHECK (due_amount >= 0 AND paid_amount >= 0 AND paid_amount <= due_amount)
);

-- Payment/refund/adjustment transactions
CREATE TABLE IF NOT EXISTS payment_transactions (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('payment', 'refund', 'adjustment')),
  amount INTEGER NOT NULL,
  method VARCHAR(20) CHECK (method IN ('Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Voucher')),
  notes TEXT,
  recorded_by VARCHAR(100),
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rename created_at to transaction_date if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_transactions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE payment_transactions RENAME COLUMN created_at TO transaction_date;
  END IF;
END $$;

-- Add missing columns to existing payment_transactions table
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS charge_category VARCHAR(30) CHECK (charge_category IN (
  'rent', 'exchange_penalty', 'downgrade_penalty',
  'cancellation_penalty', 'late_fee', 'damage_fee', 'security', 'transport'
));

-- Exchange history
CREATE TABLE IF NOT EXISTS booking_exchange_history (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_booking_product_id INTEGER NOT NULL REFERENCES booking_products(id) ON DELETE RESTRICT,
  new_booking_product_ids JSONB NOT NULL,
  exchange_penalty INTEGER NOT NULL DEFAULT 0,
  downgrade_penalty INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  exchanged_by VARCHAR(100),
  exchanged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing booking_exchange_history table if needed
DO $$ 
BEGIN
  -- Rename old_product_id to old_booking_product_id if old column exists and new doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_exchange_history' AND column_name = 'old_product_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_exchange_history' AND column_name = 'old_booking_product_id'
  ) THEN
    ALTER TABLE booking_exchange_history RENAME COLUMN old_product_id TO old_booking_product_id;
  END IF;
  
  -- If both columns exist (from failed migration), drop the old one
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_exchange_history' AND column_name = 'old_product_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_exchange_history' AND column_name = 'old_booking_product_id'
  ) THEN
    ALTER TABLE booking_exchange_history DROP COLUMN old_product_id;
  END IF;
  
  -- Drop old new_product_ids column (contains product IDs, not booking_product IDs)
  ALTER TABLE booking_exchange_history DROP COLUMN IF EXISTS new_product_ids;
  
  -- Handle new_booking_product_ids column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_exchange_history' AND column_name = 'new_booking_product_id'
  ) THEN
    -- Drop old single ID column
    ALTER TABLE booking_exchange_history DROP COLUMN new_booking_product_id;
  END IF;
  
  -- Add new_booking_product_ids if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_exchange_history' AND column_name = 'new_booking_product_ids'
  ) THEN
    ALTER TABLE booking_exchange_history ADD COLUMN new_booking_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  
  -- Drop old unnecessary columns
  ALTER TABLE booking_exchange_history DROP COLUMN IF EXISTS old_rent;
  ALTER TABLE booking_exchange_history DROP COLUMN IF EXISTS new_total_rent;
END $$;

-- Cancellation history
CREATE TABLE IF NOT EXISTS booking_cancellation_history (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  booking_product_id INTEGER NOT NULL REFERENCES booking_products(id) ON DELETE RESTRICT,
  cancellation_penalty INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  cancelled_by VARCHAR(100),
  cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing booking_cancellation_history table if needed
DO $$ 
BEGIN
  -- Drop old refund tracking columns (now calculated dynamically)
  ALTER TABLE booking_cancellation_history DROP COLUMN IF EXISTS rent_to_refund;
  ALTER TABLE booking_cancellation_history DROP COLUMN IF EXISTS security_to_refund;
END $$;

-- Rental policies (time-based)
CREATE TABLE IF NOT EXISTS rental_policies (
  id SERIAL PRIMARY KEY,
  policy_key VARCHAR(100) NOT NULL UNIQUE,
  policy_name VARCHAR(255) NOT NULL,
  policy_type VARCHAR(30) NOT NULL CHECK (policy_type IN (
    'exchange_penalty', 'cancellation_penalty', 'late_fee', 'transport_fee'
  )),
  value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('percentage', 'fixed')),
  value INTEGER NOT NULL,
  days_from_booking_min INTEGER,
  days_from_booking_max INTEGER,
  min_value INTEGER DEFAULT 0,
  max_value INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  
  CONSTRAINT chk_no_date_overlap CHECK (
    days_from_booking_min IS NULL OR 
    days_from_booking_max IS NULL OR 
    days_from_booking_min <= days_from_booking_max
  )
);

-- Booking activity log
CREATE TABLE IF NOT EXISTS booking_activity_log (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_reference_id INTEGER,
  details JSONB,
  performed_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing booking_activity_log table structure if it exists with old schema
DO $$ 
BEGIN
  -- Rename activity_type to event_type if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_activity_log' AND column_name = 'activity_type'
  ) THEN
    ALTER TABLE booking_activity_log RENAME COLUMN activity_type TO event_type;
  END IF;
  
  -- Add event_reference_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_activity_log' AND column_name = 'event_reference_id'
  ) THEN
    ALTER TABLE booking_activity_log ADD COLUMN event_reference_id INTEGER;
  END IF;
  
  -- Add details if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_activity_log' AND column_name = 'details'
  ) THEN
    ALTER TABLE booking_activity_log ADD COLUMN details JSONB;
  END IF;
  
  -- Drop old columns if they exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_activity_log' AND column_name = 'booking_product_id'
  ) THEN
    ALTER TABLE booking_activity_log DROP COLUMN IF EXISTS booking_product_id;
    ALTER TABLE booking_activity_log DROP COLUMN IF EXISTS exchange_history_id;
    ALTER TABLE booking_activity_log DROP COLUMN IF EXISTS cancellation_history_id;
    ALTER TABLE booking_activity_log DROP COLUMN IF EXISTS payment_transaction_id;
    ALTER TABLE booking_activity_log DROP COLUMN IF EXISTS description;
    ALTER TABLE booking_activity_log DROP COLUMN IF EXISTS metadata;
  END IF;
END $$;

-- ============================================
-- 4. INSERT DEFAULT POLICIES
-- ============================================

INSERT INTO rental_policies (policy_key, policy_name, policy_type, value_type, value, days_from_booking_min, days_from_booking_max) 
VALUES
  ('transport_fee_default', 'Default Transport Fee', 'transport_fee', 'fixed', 100, NULL, NULL),
  ('late_fee_default', 'Default Late Fee', 'late_fee', 'fixed', 200, NULL, NULL),
  ('exchange_penalty_within_5_days', 'Exchange Penalty (Within 5 Days)', 'exchange_penalty', 'percentage', 10, 0, 5),
  ('exchange_penalty_within_10_days', 'Exchange Penalty (6-10 Days)', 'exchange_penalty', 'percentage', 20, 6, 10),
  ('exchange_penalty_after_10_days', 'Exchange Penalty (After 10 Days)', 'exchange_penalty', 'percentage', 30, 11, NULL),
  ('cancellation_penalty_within_5_days', 'Cancellation Penalty (Within 5 Days)', 'cancellation_penalty', 'percentage', 10, 0, 5),
  ('cancellation_penalty_within_10_days', 'Cancellation Penalty (6-10 Days)', 'cancellation_penalty', 'percentage', 20, 6, 10),
  ('cancellation_penalty_after_10_days', 'Cancellation Penalty (After 10 Days)', 'cancellation_penalty', 'percentage', 30, 11, NULL)
ON CONFLICT (policy_key) DO NOTHING;

-- ============================================
-- 5. CREATE INDEXES (IF NOT EXISTS)
-- ============================================

-- Booking indexes
CREATE INDEX IF NOT EXISTS idx_bookings_customer_email ON bookings(customer_email);

-- Booking product indexes
CREATE INDEX IF NOT EXISTS idx_booking_product_status_dates ON booking_products(booking_id, status, booked_from, booked_to);
CREATE INDEX IF NOT EXISTS idx_product_availability ON booking_products(product_id, status, booked_from, booked_to);
CREATE INDEX IF NOT EXISTS idx_pending_pickups ON booking_products(status, booked_from) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_pending_returns ON booking_products(status, booked_to) WHERE status = 'in_progress';

-- Product charges indexes
CREATE INDEX IF NOT EXISTS idx_product_charges_lookup ON product_charges(booking_product_id, charge_type);

-- Payment transactions indexes
CREATE INDEX IF NOT EXISTS idx_booking_transactions ON payment_transactions(booking_id, type, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transaction_date ON payment_transactions(transaction_date);

-- Exchange history indexes
CREATE INDEX IF NOT EXISTS idx_exchange_booking ON booking_exchange_history(booking_id);
CREATE INDEX IF NOT EXISTS idx_exchange_old_product ON booking_exchange_history(old_booking_product_id);

-- Cancellation history indexes
CREATE INDEX IF NOT EXISTS idx_cancellation_booking ON booking_cancellation_history(booking_id);
CREATE INDEX IF NOT EXISTS idx_cancelled_at ON booking_cancellation_history(cancelled_at);

-- Rental policies indexes
CREATE INDEX IF NOT EXISTS idx_policy_key ON rental_policies(policy_key);
CREATE INDEX IF NOT EXISTS idx_policy_type ON rental_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_policy_active ON rental_policies(is_active);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_booking_activity ON booking_activity_log(booking_id, created_at);
