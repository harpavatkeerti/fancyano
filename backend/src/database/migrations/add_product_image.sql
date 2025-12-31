-- Add image column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;

