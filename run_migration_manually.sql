-- Run this command directly in your PostgreSQL terminal or pgAdmin

-- Step 1: Connect to your database
-- psql -U postgres -d rental_db

-- Step 2: Run these ALTER TABLE commands

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'amount'));

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0;

-- Step 3: Verify the columns were added
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
AND column_name LIKE 'discount%';

-- You should see:
-- discount_type   | character varying | 20
-- discount_value  | numeric          | NULL
-- discount_amount | numeric          | NULL
