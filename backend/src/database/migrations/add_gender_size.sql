-- Add gender and size columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS size VARCHAR(10);

