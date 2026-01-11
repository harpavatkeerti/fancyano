-- Migration: Rename exchange_charge to rent_diff for clarity
-- This reflects the streamlined exchange logic where rent_diff is a balancing amount

-- Rename column in product_exchanges table
ALTER TABLE product_exchanges 
RENAME COLUMN exchange_charge TO rent_diff;

-- Update the comment on the column
COMMENT ON COLUMN product_exchanges.rent_diff IS 'Rent difference (balancing amount): original_rent - (new_rent + exchange_penalty) if positive, else 0';

-- Note: We keep the settings key 'exchange_charges' for backward compatibility
-- It now represents the rent difference calculation setting
-- Or we can rename it below:

UPDATE settings 
SET setting_key = 'rent_diff_enabled',
    description = 'Enable rent difference calculation in exchanges (balancing amount)'
WHERE setting_key = 'exchange_charges';


