-- Migration: Remove quantity column from purchases table.
-- The user enters the total amount directly, so quantity is not needed.

ALTER TABLE purchases DROP COLUMN IF EXISTS quantity;
