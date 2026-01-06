-- Create credit_notes table
CREATE TABLE IF NOT EXISTS credit_notes (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  amount DECIMAL(10, 2) NOT NULL,
  valid_until DATE NOT NULL,
  used_amount DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'partially_used', 'fully_used', 'expired'
  issued_by VARCHAR(255),
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add index on customer info for faster lookups
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON credit_notes(customer_name, customer_phone);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_credit_notes_booking ON credit_notes(booking_id);

