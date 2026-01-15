-- Migration: Add discount fields to bookings table
-- This migration adds support for percentage or fixed amount discounts

-- Add discount_type column (can be 'percentage' or 'amount')
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'amount'));

-- Add discount_value column (stores either percentage value or fixed amount)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10, 2) DEFAULT 0;

-- Add discount_amount column (stores the calculated discount amount in rupees)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN bookings.discount_type IS 'Type of discount: percentage or amount';
COMMENT ON COLUMN bookings.discount_value IS 'Value of discount: percentage (0-100) or fixed amount';
COMMENT ON COLUMN bookings.discount_amount IS 'Calculated discount amount in rupees';
