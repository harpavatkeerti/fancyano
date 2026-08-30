-- Migration: Create notifications table for in-app notifications
-- Stores notifications for admin users (e.g., cash adjustment alerts)

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_role VARCHAR(20) NOT NULL DEFAULT 'admin',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info',  -- 'info', 'warning', 'action_required'
  reference_type VARCHAR(50),                -- 'cash_adjustment', 'booking', etc.
  reference_id INTEGER,                      -- ID of the referenced entity
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_role);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

COMMENT ON TABLE notifications IS 'In-app notifications for admin users';
