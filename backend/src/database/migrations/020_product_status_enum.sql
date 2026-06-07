-- Migration 020: Replace availability boolean with status enum on products
-- Adds a proper status column and removes the boolean availability column

-- Step 1: Create the enum type
DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('available', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add the new status column, defaulting all existing rows to 'available'
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS status product_status NOT NULL DEFAULT 'available';

-- Step 3: Set all existing products to 'available' (already covered by default, explicit for clarity)
UPDATE products SET status = 'available' WHERE status IS NULL;

-- Step 4: Drop the old boolean availability column
ALTER TABLE products DROP COLUMN IF EXISTS availability;

-- Step 5: Index for fast filtering by status
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
