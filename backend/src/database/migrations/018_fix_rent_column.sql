-- Fix Migration: Drop and recreate rent column with correct values
-- This fixes the issue where rent was incorrectly multiplied by 100

-- Drop the incorrectly migrated rent column
ALTER TABLE products 
DROP COLUMN IF EXISTS rent;

-- Add rent column again as INTEGER
ALTER TABLE products 
ADD COLUMN rent INTEGER;

-- Copy rent_per_day to rent directly (simple type change: DECIMAL to INTEGER)
-- Values are in rupees, just changing type from DECIMAL to INTEGER
UPDATE products 
SET rent = rent_per_day::INTEGER
WHERE rent_per_day IS NOT NULL;

-- Set default for rent
ALTER TABLE products 
ALTER COLUMN rent SET DEFAULT 0;

-- Make rent NOT NULL after migration
ALTER TABLE products 
ALTER COLUMN rent SET NOT NULL;

-- Add check constraint for rent
ALTER TABLE products 
ADD CONSTRAINT chk_product_rent CHECK (rent >= 0);

-- Mark rent_per_day as deprecated
COMMENT ON COLUMN products.rent_per_day IS 'DEPRECATED: Use rent column (INTEGER)';
