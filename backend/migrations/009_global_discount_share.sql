-- Add global_discount_share column to booking_products
-- Tracks how much of the global booking discount was allocated to each product
ALTER TABLE booking_products ADD COLUMN IF NOT EXISTS global_discount_share INTEGER DEFAULT 0;
