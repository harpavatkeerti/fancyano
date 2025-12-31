-- Add purchase_price column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2);

