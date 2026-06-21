-- Migration 024: Add phone_country, alternate_phone fields and is_deleted to users
-- Part 1 of Step 1: Users as First-Class Entity

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_country           VARCHAR(2)  NOT NULL DEFAULT 'IN';
ALTER TABLE users ADD COLUMN IF NOT EXISTS alternate_phone         VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS alternate_phone_country VARCHAR(2)  DEFAULT 'IN';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted              BOOLEAN     NOT NULL DEFAULT FALSE;

-- Phone must be unique (it is the natural customer identifier)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);
  END IF;
END
$$;

-- Index for fast phone search
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);
