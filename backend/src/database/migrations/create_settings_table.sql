-- Migration: Create settings table for storing application settings

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(50) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add comments
COMMENT ON TABLE settings IS 'Application-wide settings and configurations';
COMMENT ON COLUMN settings.setting_key IS 'Unique identifier for the setting (e.g., "transportation_charge")';
COMMENT ON COLUMN settings.setting_value IS 'The actual value stored as text';
COMMENT ON COLUMN settings.setting_type IS 'Data type of the setting for proper parsing';
COMMENT ON COLUMN settings.category IS 'Category for grouping settings (e.g., "billing", "policies")';

-- Insert default transportation charge
INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
VALUES 
    ('transportation_charge', '0', 'number', 'Transportation/delivery charge in rupees', 'billing')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert other useful default settings
INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
VALUES 
    ('transportation_enabled', 'true', 'boolean', 'Enable/disable transportation service', 'policies'),
    ('currency_symbol', '₹', 'string', 'Currency symbol for display', 'general'),
    ('business_name', 'Rental Store', 'string', 'Business name for bills and invoices', 'general')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert default refund/cancellation policy
INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
VALUES 
    ('refund_policy', '{"booked_date":0,"before_7_days":0,"before_3_days":10,"before_1_day":20,"on_booking_date":50,"days":[3,5,7,-1]}', 'json', 'Refund penalty percentages based on days from booking', 'policies')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert default cancellation policy  
INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
VALUES 
    ('cancellation_policy', '{"booked_date":0,"before_7_days":0,"before_3_days":10,"before_1_day":20,"on_booking_date":50,"days":[3,5,7,-1]}', 'json', 'Cancellation penalty percentages based on days from booking', 'policies')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert default exchange charges
INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
VALUES 
    ('exchange_charges', '0', 'number', 'Fixed exchange charge in rupees', 'billing')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert default late return charges
INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
VALUES 
    ('late_return_charges', '100', 'number', 'Late return charge percentage', 'billing')
ON CONFLICT (setting_key) DO NOTHING;


