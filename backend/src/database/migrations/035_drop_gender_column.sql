-- Drop the gender column from products table.
-- Gender is no longer used; products use category_id -> product_categories for classification.
ALTER TABLE products DROP COLUMN IF EXISTS gender;
