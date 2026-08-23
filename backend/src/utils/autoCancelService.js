// Auto-cancel logic — called directly by autoCancelScheduler (no HTTP round-trip).
const pool = require('../database/connection');
const { PENDING_BOOKING_TIMEOUT_MINUTES } = require('../constants/timerConstants');

/**
 * Finds pending bookings older than PENDING_BOOKING_TIMEOUT_MINUTES and deletes them.
 * - Cart has a separate timer (CART_TIMEOUT_MINUTES, frontend-only).
 * - Once a booking is created with "pending" status, the user must make a payment
 *   (which transitions the status to "confirmed") before the timeout expires.
 * @returns {{ cancelled: Array<{id, customer_name, created_at}> }}
 */
async function checkAndCancelExpiredBookings() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If timer is disabled (-1), skip
    if (PENDING_BOOKING_TIMEOUT_MINUTES < 0) {
      return { cancelled: [] };
    }

    // Find pending bookings older than the configured timeout
    const cutoff = new Date(Date.now() - PENDING_BOOKING_TIMEOUT_MINUTES * 60 * 1000);

    // Get pending bookings older than the configured timeout
    const result = await client.query(
      `SELECT b.id, u.name AS customer_name, b.created_at
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.status = 'pending'
       AND b.created_at < $1`,
      [cutoff]
    );

    const cancelledBookings = [];

    for (const booking of result.rows) {
      // Delete the booking (cascade will delete booking_products)
      await client.query('DELETE FROM bookings WHERE id = $1', [booking.id]);
      cancelledBookings.push({
        id: booking.id,
        customer_name: booking.customer_name,
        created_at: booking.created_at,
      });
    }

    await client.query('COMMIT');

    return { cancelled: cancelledBookings };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { checkAndCancelExpiredBookings };
