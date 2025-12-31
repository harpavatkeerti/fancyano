-- Add alternate_phone column to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20);

