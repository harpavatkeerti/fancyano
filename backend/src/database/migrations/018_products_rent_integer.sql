-- Migration: Update products table to use INTEGER rent instead of DECIMAL rent_per_day
-- Simple type change: values are in rupees (integers), just changing from DECIMAL to INTEGER

-- Add new rent column as INTEGER
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS rent INTEGER;

-- Migrate data: copy rent_per_day to rent (simple type cast)
-- Values are in rupees, just changing type from DECIMAL to INTEGER
UPDATE products 
SET rent = rent_per_day::INTEGER
WHERE rent IS NULL AND rent_per_day IS NOT NULL;

-- Set default for rent
ALTER TABLE products 
ALTER COLUMN rent SET DEFAULT 0;

-- Make rent NOT NULL after migration
ALTER TABLE products 
ALTER COLUMN rent SET NOT NULL;

-- Add check constraint for rent
ALTER TABLE products 
ADD CONSTRAINT chk_product_rent CHECK (rent >= 0);

-- Drop the old rent_per_day column
-- Comment: Uncomment the line below once migration is verified
-- ALTER TABLE products DROP COLUMN IF EXISTS rent_per_day;

-- Mark rent_per_day as deprecated for now
COMMENT ON COLUMN products.rent_per_day IS 'DEPRECATED: Use rent column (INTEGER)';

-- Convert security_deposit from DECIMAL to INTEGER (simple type change)
ALTER TABLE products 
ALTER COLUMN security_deposit TYPE INTEGER USING security_deposit::INTEGER;
