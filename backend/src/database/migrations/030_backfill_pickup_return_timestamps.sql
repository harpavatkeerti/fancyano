-- Backfill picked_up_at for products already picked up (status = 'in_progress')
-- that don't have the timestamp set yet.
-- Uses updated_at as the best available approximation for when pickup happened.
UPDATE booking_products
SET picked_up_at = updated_at
WHERE status = 'in_progress'
  AND picked_up_at IS NULL;

-- Backfill returned_at for products already returned (status = 'completed')
-- that don't have the timestamp set yet.
UPDATE booking_products
SET returned_at = updated_at
WHERE status = 'completed'
  AND returned_at IS NULL;
