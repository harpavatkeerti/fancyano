-- Migration 029: Fix vendors table column names
-- The vendors table was created with incorrect column names (firm_name, mobile_number, gstn, pan).
-- This migration renames them to match the application's expected schema.

-- Rename columns to match vendorService.js and shared API types
ALTER TABLE vendors RENAME COLUMN firm_name TO name;
ALTER TABLE vendors RENAME COLUMN mobile_number TO phone;
ALTER TABLE vendors RENAME COLUMN gstn TO gst_number;
ALTER TABLE vendors RENAME COLUMN pan TO pan_number;

-- Add missing columns (notes, phone length fix)
ALTER TABLE vendors ALTER COLUMN phone TYPE VARCHAR(20);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notes VARCHAR(255);

-- Recreate index on the new column name
DROP INDEX IF EXISTS idx_vendors_firm_name;
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
