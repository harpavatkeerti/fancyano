-- Migration 021: Introduce tracking_status on product_tracking
-- Replaces the old two-field model (tracking_type + status: out/returned)
-- with a single tracking_status field.
--
-- No backward compat needed — table is cleared and rebuilt clean.

-- Step 1: Clear all existing rows
TRUNCATE TABLE product_tracking;

-- Step 2: Drop old columns no longer needed
ALTER TABLE product_tracking
  DROP COLUMN IF EXISTS tracking_type,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS out_date,
  DROP COLUMN IF EXISTS return_date;

-- Step 3: Add tracking_status (NOT NULL — every row must have a value)
ALTER TABLE product_tracking
  ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(50) NOT NULL DEFAULT 'in_house';

-- Remove the default so new rows must supply the value explicitly
ALTER TABLE product_tracking
  ALTER COLUMN tracking_status DROP DEFAULT;

-- Step 4: Add CHECK constraint
ALTER TABLE product_tracking
  ADD CONSTRAINT chk_tracking_status CHECK (
    tracking_status IN (
      'in_house',
      'picked_by_customer',
      'going_to_dry_clean',
      'alternation_related_work',
      'repair',
      'other_work'
    )
  );

-- Step 5: Index for fast "current status" lookup (latest record per product)
CREATE INDEX IF NOT EXISTS idx_product_tracking_product_created
  ON product_tracking(product_id, created_at DESC);
