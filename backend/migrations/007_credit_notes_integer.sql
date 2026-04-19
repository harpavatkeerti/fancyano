-- Migrate credit_notes amount columns from DECIMAL(10,2) to INTEGER
-- All amounts in the system are whole rupees (integers)

ALTER TABLE credit_notes
  ALTER COLUMN amount TYPE INTEGER USING amount::INTEGER,
  ALTER COLUMN used_amount TYPE INTEGER USING used_amount::INTEGER;
