-- Product Exchanges Table
-- Tracks product exchanges within bookings
CREATE TABLE IF NOT EXISTS product_exchanges (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
    original_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    exchanged_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    exchange_date DATE NOT NULL DEFAULT CURRENT_DATE,
    days_from_booking INTEGER, -- Number of days from booking date
    penalty_percentage DECIMAL(5, 2) DEFAULT 0, -- Penalty % from exchange policy
    exchange_charge DECIMAL(10, 2) DEFAULT 0, -- Fixed exchange charge
    total_charge DECIMAL(10, 2) DEFAULT 0, -- Total charge for this exchange
    reason TEXT,
    exchanged_by VARCHAR(255), -- User who performed the exchange (admin/salesman name)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_exchanges_booking ON product_exchanges(booking_id);
CREATE INDEX IF NOT EXISTS idx_product_exchanges_original_product ON product_exchanges(original_product_id);
CREATE INDEX IF NOT EXISTS idx_product_exchanges_exchanged_product ON product_exchanges(exchanged_product_id);

