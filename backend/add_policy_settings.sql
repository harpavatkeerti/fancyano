-- Insert default refund/cancellation policies if they don't exist

-- Insert default refund policy (within X days from booking date)
INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
VALUES 
    ('refund_policy', '{"booked_date":0,"before_7_days":0,"before_3_days":10,"before_1_day":20,"on_booking_date":50,"days":[3,5,7,-1]}', 'json', 'Refund penalty percentages based on days from booking', 'policies')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- Insert default cancellation policy (within X days from booking date)
INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
VALUES 
    ('cancellation_policy', '{"booked_date":0,"before_7_days":0,"before_3_days":10,"before_1_day":20,"on_booking_date":50,"days":[3,5,7,-1]}', 'json', 'Cancellation penalty percentages based on days from booking', 'policies')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

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

-- Verify the settings
SELECT setting_key, setting_value, setting_type, description FROM settings 
WHERE setting_key IN ('refund_policy', 'cancellation_policy', 'exchange_charges', 'late_return_charges')
ORDER BY setting_key;

