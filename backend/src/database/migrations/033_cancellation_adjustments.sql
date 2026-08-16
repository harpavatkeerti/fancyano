-- Migration: Add cancellation_adjustments JSONB column to bookings table
-- Stores per-cancellation-event records with extra_refund details for audit
-- Drop unused booking_cancellations table (created in 014 but never used)

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_adjustments JSONB DEFAULT '[]';

COMMENT ON COLUMN bookings.cancellation_adjustments IS 'Array of cancellation adjustment records. Each entry: {cancelled_product_ids, calculated_refund, edited_refund, extra_refund, total_penalty, discount_reverted, total_paid, note, cancelled_by, cancelled_at}';

DROP TABLE IF EXISTS booking_cancellations;
