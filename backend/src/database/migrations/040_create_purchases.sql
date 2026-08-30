-- Migration: Create purchases table for simplified purchase/procurement tracking.

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  vendor_name VARCHAR(255) NOT NULL,
  item_description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount INTEGER NOT NULL CHECK (amount > 0),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_image TEXT,
  notes TEXT,
  recorded_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_vendor ON purchases(vendor_name);

COMMENT ON TABLE purchases IS 'Simplified purchase/procurement tracking';
