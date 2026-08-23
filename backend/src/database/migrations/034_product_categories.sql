-- ═══════════════════════════════════════════════════════════════════════════════
-- 034_product_categories.sql
-- Dynamic product categories (Men, Women, Kids …) and product types (subcategories)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Categories table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default categories
INSERT INTO product_categories (name, display_order)
VALUES ('Women', 1), ('Men', 2)
ON CONFLICT (name) DO NOTHING;

-- ── 2. Product types (subcategories) table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS product_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
  -- NULL category_id = neutral type, shown for ALL categories
  size_type VARCHAR(20) NOT NULL DEFAULT 'standard'
    CHECK (size_type IN ('numeric', 'standard', 'fancy', 'none')),
    -- numeric  = 34, 36, 38, 40, 42, 44, 46
    -- standard = S, M, L, XL, XXL
    -- fancy    = age-based (2-3 years, 3-4 years, etc.)
    -- none     = sizeless (e.g. Artificial Jewelleries)
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, category_id)
);

-- Seed Women product types
INSERT INTO product_types (name, category_id, size_type, display_order) VALUES
  ('Lehenga',          (SELECT id FROM product_categories WHERE name = 'Women'), 'standard', 1),
  ('Girlish Crop Top', (SELECT id FROM product_categories WHERE name = 'Women'), 'standard', 2),
  ('Gowns',            (SELECT id FROM product_categories WHERE name = 'Women'), 'standard', 3)
ON CONFLICT (name, category_id) DO NOTHING;

-- Seed Men product types
INSERT INTO product_types (name, category_id, size_type, display_order) VALUES
  ('Sherwani',     (SELECT id FROM product_categories WHERE name = 'Men'), 'numeric',  1),
  ('Indo Western', (SELECT id FROM product_categories WHERE name = 'Men'), 'numeric',  2),
  ('Suit',         (SELECT id FROM product_categories WHERE name = 'Men'), 'numeric',  3),
  ('Kurta Pajama', (SELECT id FROM product_categories WHERE name = 'Men'), 'standard', 4)
ON CONFLICT (name, category_id) DO NOTHING;

-- Seed neutral types (category_id = NULL → shown for all categories)
-- For the UNIQUE constraint, NULL category_id allows multiple neutral types
INSERT INTO product_types (name, category_id, size_type, display_order)
SELECT * FROM (VALUES
  ('Artificial Jewelleries', NULL::INTEGER, 'none'::VARCHAR(20),     90),
  ('Fancy Costumes',         NULL::INTEGER, 'fancy'::VARCHAR(20),    91),
  ('Other',                  NULL::INTEGER, 'standard'::VARCHAR(20), 99)
) AS v(name, category_id, size_type, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM product_types pt WHERE pt.name = v.name AND pt.category_id IS NULL
);

-- ── 3. Add category_id FK to products table ─────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id
  INTEGER REFERENCES product_categories(id);

-- ── 4. Migrate existing products to "Women" category ────────────────────────
UPDATE products
SET category_id = (SELECT id FROM product_categories WHERE name = 'Women')
WHERE category_id IS NULL;

-- ── 5. Index for fast lookups ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_types_category_id ON product_types(category_id);
