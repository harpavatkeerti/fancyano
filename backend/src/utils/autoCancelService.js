// Auto-cancel logic — called directly by autoCancelScheduler (no HTTP round-trip).
const pool = require('../database/connection');

/**
 * Finds pending bookings older than 5 minutes with no payment and deletes them.
 * @returns {{ cancelled: Array<{id, customer_name, created_at}> }}
 */
async function checkAndCancelExpiredBookings() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find pending bookings older than 5 minutes with no payment
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const result = await client.query(
      `SELECT b.id, b.customer_name, b.created_at 
       FROM bookings b
       LEFT JOIN payment_transactions pt ON pt.booking_id = b.id AND pt.type = 'payment'
       WHERE b.status = 'pending' 
       AND pt.id IS NULL
       AND b.created_at < $1`,
      [fiveMinutesAgo]
    );

    const cancelledBookings = [];

    for (const booking of result.rows) {
      // Delete the booking (cascade will delete booking_products)
      await client.query('DELETE FROM bookings WHERE id = $1', [booking.id]);
      cancelledBookings.push({
        id: booking.id,
        customer_name: booking.customer_name,
        created_at: booking.created_at
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
