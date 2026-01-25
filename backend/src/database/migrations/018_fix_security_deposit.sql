-- Fix Migration: Clean up security_deposit conversion and drop rent_per_day
-- Remove the unnecessary security_deposit_new column and convert security_deposit directly
-- Drop the deprecated rent_per_day column

-- Drop the unnecessary security_deposit_new column
ALTER TABLE products 
DROP COLUMN IF EXISTS security_deposit_new;

-- Convert security_deposit from DECIMAL to INTEGER directly
ALTER TABLE products 
ALTER COLUMN security_deposit TYPE INTEGER USING security_deposit::INTEGER;

-- Drop the deprecated rent_per_day column
ALTER TABLE products 
DROP COLUMN IF EXISTS rent_per_day;
