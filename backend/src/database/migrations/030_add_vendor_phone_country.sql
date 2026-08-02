-- Migration 030: Add phone_country column to vendors table
-- Vendors phone was stored without country code context.
-- This matches the pattern used for customers (users table).

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS phone_country VARCHAR(5) DEFAULT 'IN' NOT NULL;
