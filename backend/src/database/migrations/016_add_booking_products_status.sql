-- Migration: Add status column to booking_products table
-- This allows tracking which products are cancelled in partial cancellations

-- Add status column with default 'active'
ALTER TABLE booking_products 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' 
CHECK (status IN ('active', 'cancelled', 'exchanged'));

-- Update existing rows to have 'active' status
UPDATE booking_products 
SET status = 'active' 
WHERE status IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_booking_products_status ON booking_products(status);

-- Add comment
COMMENT ON COLUMN booking_products.status IS 'Status of product in booking: active, cancelled, or exchanged';

