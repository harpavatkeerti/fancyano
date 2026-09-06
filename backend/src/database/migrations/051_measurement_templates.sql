-- ═══════════════════════════════════════════════════════════════════════════════
-- 051_measurement_templates.sql
-- Measurement templates: structured field definitions for product measurements.
-- Each product type can reference a measurement template that defines
-- which fields the measurement form should display.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Measurement templates table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS measurement_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  -- JSON array of { key, label, group? } objects defining the measurement fields
  -- e.g. [{"key":"waist","label":"Waist (in inches)","group":"Upper Body"}]
  fields JSONB NOT NULL DEFAULT '[]',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. Seed starter templates based on current hardcoded fields ─────────────

-- Women Clothing template (matches current MeasurementModal women fields)
INSERT INTO measurement_templates (name, fields, display_order) VALUES
  ('Women Clothing', '[
    {"key":"waist","label":"Waist (in inches)"},
    {"key":"bust","label":"Bust (in inches)"},
    {"key":"shoulder","label":"Shoulder (in inches)"},
    {"key":"sleevesUp","label":"Sleeves Up (in inches)"},
    {"key":"sleevesE","label":"Sleeves E (in inches)"},
    {"key":"sleevesB","label":"Sleeves B (in inches)"},
    {"key":"lehengaLength","label":"Lehenga Length (in inches)"}
  ]'::jsonb, 1)
ON CONFLICT (name) DO NOTHING;

-- Men Clothing template (matches current MeasurementModal men fields)
INSERT INTO measurement_templates (name, fields, display_order) VALUES
  ('Men Clothing', '[
    {"key":"waistSize","label":"Waist Size (in inches)"},
    {"key":"sideTight","label":"Side Tight (in inches)","group":"Tight Fit"},
    {"key":"sleevesTight","label":"Sleeves Tight (in inches)","group":"Tight Fit"},
    {"key":"sleevesLength","label":"Sleeves Length (in inches)","group":"Tight Fit"},
    {"key":"pantLength","label":"Pant Length (in inches)","group":"Tight Fit"},
    {"key":"sideLoose","label":"Side Loose (in inches)","group":"Loose Fit"},
    {"key":"sleevesLoose","label":"Sleeves Loose (in inches)","group":"Loose Fit"},
    {"key":"sleevesLengthLoose","label":"Sleeves Length (in inches)","group":"Loose Fit"},
    {"key":"pantLengthLoose","label":"Pant Length (in inches)","group":"Loose Fit"}
  ]'::jsonb, 2)
ON CONFLICT (name) DO NOTHING;

-- ── 3. Add measurement_template_id FK to product_types ──────────────────────
ALTER TABLE product_types ADD COLUMN IF NOT EXISTS measurement_template_id
  INTEGER REFERENCES measurement_templates(id) ON DELETE SET NULL;

-- ── 4. Auto-assign starter templates to existing product types ──────────────
-- Women types → "Women Clothing" template
UPDATE product_types
SET measurement_template_id = (SELECT id FROM measurement_templates WHERE name = 'Women Clothing')
WHERE category_id = (SELECT id FROM product_categories WHERE name = 'Women')
  AND measurement_template_id IS NULL;

-- Men types → "Men Clothing" template
UPDATE product_types
SET measurement_template_id = (SELECT id FROM measurement_templates WHERE name = 'Men Clothing')
WHERE category_id = (SELECT id FROM product_categories WHERE name = 'Men')
  AND measurement_template_id IS NULL;

-- Neutral types (Artificial Jewelleries, Fancy Costumes, Other) → NULL (no template)
-- No action needed; they already have NULL measurement_template_id

-- ── 5. Backup existing measurements on booking_products ─────────────────────
ALTER TABLE booking_products ADD COLUMN IF NOT EXISTS measurements_backup JSONB;

-- Copy existing measurements to backup column (only where not already backed up)
UPDATE booking_products
SET measurements_backup = measurements
WHERE measurements IS NOT NULL
  AND measurements_backup IS NULL;

-- ── 6. Add measurement_template_id to booking_products ──────────────────────
-- Tracks which template was used when the measurements were recorded
ALTER TABLE booking_products ADD COLUMN IF NOT EXISTS measurement_template_id
  INTEGER REFERENCES measurement_templates(id) ON DELETE SET NULL;

-- ── 7. Backfill measurement_template_id for existing booking_products ───────
-- For existing booking_products with measurements, assign the template based
-- on the product's type → template mapping
UPDATE booking_products bp
SET measurement_template_id = pt.measurement_template_id
FROM products p
JOIN product_categories pc ON p.category_id = pc.id
JOIN product_types pt ON pt.name = p.name AND (pt.category_id = pc.id OR (pt.category_id IS NULL AND pc.id IS NULL))
WHERE bp.product_id = p.id
  AND bp.measurements IS NOT NULL
  AND bp.measurement_template_id IS NULL
  AND pt.measurement_template_id IS NOT NULL;

-- ── 8. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_types_measurement_template_id ON product_types(measurement_template_id);
CREATE INDEX IF NOT EXISTS idx_booking_products_measurement_template_id ON booking_products(measurement_template_id);
