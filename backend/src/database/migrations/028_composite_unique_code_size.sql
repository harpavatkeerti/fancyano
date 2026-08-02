-- Migration 028: Composite unique index on (code, size) for products
-- Purpose: Allow same product code with different sizes while preventing exact duplicates.
-- Replaces the old single-column UNIQUE constraint on code.

-- 1. Drop the old single-column unique constraint (allows same code with different sizes)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_code_key;

-- 2. Sized products: (code, size) must be unique (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_code_size
  ON products (LOWER(code), LOWER(size))
  WHERE size IS NOT NULL;

-- 3. Sizeless products: code alone must be unique (case-insensitive)
-- Without this, NULL != NULL in SQL would allow duplicate sizeless products.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_code_no_size
  ON products (LOWER(code))
  WHERE size IS NULL;
