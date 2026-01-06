-- Add new columns to users table for credentials and additional info
ALTER TABLE users
ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS password VARCHAR(255),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS address TEXT;

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Update existing users to have a username (based on their name)
UPDATE users 
SET username = LOWER(REPLACE(name, ' ', ''))
WHERE username IS NULL;

