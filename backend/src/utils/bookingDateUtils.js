const pool = require('../database/connection');

/**
 * Recalculate booking-level booked_from / booked_to from its active products.
 *
 * Uses MIN(booked_from) and MAX(booked_to) across all booking_products that are
 * not cancelled or exchanged.  Must be called whenever a product's dates change
 * (date edit, exchange, cancellation, etc.).
 *
 * @param {number} bookingId - The booking to update.
 * @param {Object} [client]  - Optional pg client; pass one when inside a transaction
 *                             so the update participates in the same atomic block.
 */
async function recalcBookingDateRange(bookingId, client = null) {
  const db = client || pool;

  const result = await db.query(
    `SELECT MIN(booked_from) AS min_from, MAX(booked_to) AS max_to
     FROM booking_products
     WHERE booking_id = $1
       AND status NOT IN ('cancelled', 'exchanged')`,
    [bookingId]
  );

  const { min_from, max_to } = result.rows[0];

  if (min_from && max_to) {
    await db.query(
      `UPDATE bookings
         SET booked_from = $1,
             booked_to   = $2,
             updated_at  = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [min_from, max_to, bookingId]
    );
  }
}

/**
 * Assert that a product's date range is available (no conflicting active bookings).
 *
 * Throws an error if any existing booking_product for `productId` overlaps the
 * requested `[bookedFrom, bookedTo]` range.  Use `excludeBookingId` when editing
 * an existing booking so that booking's own products are not treated as conflicts.
 *
 * Must be called inside the caller's transaction so that the availability
 * snapshot is consistent with any rows already inserted/updated in this tx.
 *
 * @param {number}  productId        - Catalog product ID.
 * @param {string}  bookedFrom       - ISO date string (YYYY-MM-DD).
 * @param {string}  bookedTo         - ISO date string (YYYY-MM-DD).
 * @param {Object}  [opts]
 * @param {number}  [opts.excludeBookingId] - Booking ID to exclude (self).
 * @param {Object}  [opts.client]    - pg client to use (required when inside a tx).
 */
async function checkProductAvailability(productId, bookedFrom, bookedTo, { excludeBookingId = null, client = null } = {}) {
  const db = client || pool;

  const conflict = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM booking_products bp
       JOIN bookings b ON bp.booking_id = b.id
       WHERE bp.product_id = $1
         AND bp.status NOT IN ('cancelled', 'exchanged', 'completed')
         AND b.status  NOT IN ('cancelled')
         AND bp.booked_from <= $3
         AND bp.booked_to   >= $2
         AND ($4::int IS NULL OR b.id <> $4)
     ) AS has_conflict`,
    [productId, bookedFrom, bookedTo, excludeBookingId]
  );

  if (conflict.rows[0].has_conflict) {
    const from = new Date(bookedFrom).toLocaleDateString('en-GB');
    const to   = new Date(bookedTo).toLocaleDateString('en-GB');
    throw new Error(`Product is not available from ${from} to ${to}`);
  }
}

module.exports = { recalcBookingDateRange, checkProductAvailability };
