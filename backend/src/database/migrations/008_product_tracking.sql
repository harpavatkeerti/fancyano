-- Product Tracking Table
CREATE TABLE IF NOT EXISTS product_tracking (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    product_code VARCHAR(100) NOT NULL,
    tracking_type VARCHAR(50) NOT NULL CHECK (tracking_type IN ('going_to_dry_clean', 'alternation_related_work', 'repair', 'other_work', 'picked_by_customer')),
    work_description TEXT,
    status VARCHAR(50) DEFAULT 'out' CHECK (status IN ('out', 'returned')),
    out_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    return_date TIMESTAMP,
    actual_pickup_date TIMESTAMP,
    scheduled_pickup_date TIMESTAMP,
    is_early_pickup BOOLEAN DEFAULT FALSE,
    early_pickup_days INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_tracking_product ON product_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_product_tracking_booking ON product_tracking(booking_id);
CREATE INDEX IF NOT EXISTS idx_product_tracking_code ON product_tracking(product_code);
CREATE INDEX IF NOT EXISTS idx_product_tracking_status ON product_tracking(status);

