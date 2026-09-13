-- Migration: Add 'date_change_fee' to product_charges charge_type constraint
-- This allows the charge accounting system to track date change fees
-- alongside late_fee and damage_fee in the 'fees' category.

ALTER TABLE product_charges
  DROP CONSTRAINT IF EXISTS product_charges_charge_type_check;

ALTER TABLE product_charges
  ADD CONSTRAINT product_charges_charge_type_check
  CHECK (charge_type IN (
    'rent', 'exchange_penalty', 'downgrade_penalty',
    'cancellation_penalty', 'late_fee', 'damage_fee',
    'date_change_fee', 'security'
  ));
