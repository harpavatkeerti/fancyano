-- Migration 052: Create transporters table and add transport_details to booking_products
-- Pattern: matches vendors table (027_create_vendors_table.sql)

-- 1. Create transporters master table
CREATE TABLE IF NOT EXISTS transporters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  phone_country VARCHAR(5) DEFAULT 'IN',
  bus_no VARCHAR(50),
  notes VARCHAR(255),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add transport_details JSONB to booking_products (per-product transport)
ALTER TABLE booking_products
  ADD COLUMN IF NOT EXISTS transport_details JSONB DEFAULT NULL;

COMMENT ON COLUMN booking_products.transport_details IS 
  'Per-product transport snapshot: {transporter_id, transporter_name, phone, bus_no, destination}. NULL = no transport.';
