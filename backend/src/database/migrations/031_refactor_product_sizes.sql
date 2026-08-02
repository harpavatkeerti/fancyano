-- Migration 031: Refactor product sizes
-- Adds available_sizes array and rent_overrides JSONB to products.
-- Adds size column to booking_products and product_tracking.
-- Drops old code+size composite indexes (they will be replaced by code-only
-- unique index AFTER duplicate sibling rows are cleaned up in Step 11).

-- 1. Add new columns to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS available_sizes TEXT[],
  ADD COLUMN IF NOT EXISTS rent_overrides JSONB;

-- 2. Migrate existing data: populate available_sizes from the size column
-- For the canonical product (lowest id per code+name group), set available_sizes
-- to the aggregated array of all sizes from that group.
UPDATE products p
SET available_sizes = sub.sizes
FROM (
  SELECT MIN(id) as canonical_id, code, name,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT size ORDER BY size), NULL) as sizes
  FROM products
  WHERE status != 'archived'
  GROUP BY code, name
) sub
WHERE p.id = sub.canonical_id;

-- For products with NULL size (e.g. Artificial Jewelleries), ensure available_sizes = NULL
-- (ARRAY_REMOVE of all NULLs produces '{}', which we convert to NULL)
UPDATE products SET available_sizes = NULL
WHERE size IS NULL AND available_sizes = '{}';

-- 3. Add size column to booking_products
ALTER TABLE booking_products
  ADD COLUMN IF NOT EXISTS size VARCHAR(20);

-- 4. Add size column to product_tracking
ALTER TABLE product_tracking
  ADD COLUMN IF NOT EXISTS size VARCHAR(20);

-- 5. Drop old composite unique indexes (code+size)
-- The new code-only unique index will be created in Step 11 AFTER
-- duplicate sibling rows are cleaned up.
DROP INDEX IF EXISTS uq_products_code_size;
DROP INDEX IF EXISTS uq_products_code_no_size;
