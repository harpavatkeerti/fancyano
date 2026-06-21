-- Add alternate_phone column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20);
