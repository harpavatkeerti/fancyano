-- Migration 027: Create vendors table and add vendor_id FK to products
-- Purpose: Store vendor (supplier) information as a separate entity, linked to products via FK.

-- 1. Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT,
  gst_number VARCHAR(20),
  pan_number VARCHAR(15),
  notes VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add vendor_id FK to products (ON DELETE RESTRICT — vendor cannot be deleted while products reference it)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT;
