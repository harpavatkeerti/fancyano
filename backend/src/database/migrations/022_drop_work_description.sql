-- Migration 022: Drop work_description from product_tracking
-- work_description is redundant with notes — both serve as free-text context
-- for a tracking event. All descriptions should use notes going forward.
ALTER TABLE product_tracking DROP COLUMN IF EXISTS work_description;
