-- 053_normalize_transport_details.sql
-- Normalize transport: add transporter_id FK column, migrate data from JSONB,
-- then strip duplicated master fields from JSONB (keep per-shipment only).

-- 1. Add transporter_id FK column
ALTER TABLE booking_products
  ADD COLUMN IF NOT EXISTS transporter_id INTEGER REFERENCES transporters(id);

-- 2. Populate from existing JSONB data
UPDATE booking_products
SET transporter_id = (transport_details->>'transporter_id')::INTEGER
WHERE transport_details IS NOT NULL
  AND transport_details->>'transporter_id' IS NOT NULL;

-- 3. Strip duplicated master fields from JSONB (keep per-shipment only)
UPDATE booking_products
SET transport_details = transport_details - 'transporter_id' - 'transporter_name' - 'phone' - 'bus_no'
WHERE transport_details IS NOT NULL;

-- 4. Clean up empty JSONB objects
UPDATE booking_products
SET transport_details = NULL
WHERE transport_details = '{}'::jsonb;
