-- Migration 026: Drop redundant users_phone_key constraint
-- 
-- The users table has two unique constraints on the phone column:
--   users_phone_key    — auto-named by PostgreSQL from the original CREATE TABLE (phone UNIQUE)
--   users_phone_unique — explicitly named, added by migration 024
--
-- They are functionally identical. Drop the auto-named one and keep the explicit one.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
