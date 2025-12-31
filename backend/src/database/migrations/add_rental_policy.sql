-- Add rental_policy column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS rental_policy VARCHAR(20) DEFAULT '3_days';

-- Update existing Fancy Costumes to use 24_hours policy
UPDATE products 
SET rental_policy = '24_hours' 
WHERE name = 'Fancy Costumes';

COMMENT ON COLUMN products.rental_policy IS 'Rental policy: 3_days (default, includes 3 days) or 24_hours (for Fancy Costumes)';

