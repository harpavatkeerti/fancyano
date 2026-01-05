// Auto-cancel pending bookings that are older than 5 minutes without payment
const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// This endpoint should be called periodically (e.g., every minute) by a cron job or scheduler
router.post('/check', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find pending bookings older than 5 minutes with no payment
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const result = await client.query(
      `SELECT id, customer_name, created_at 
       FROM bookings 
       WHERE status = 'pending' 
       AND paid_amount = 0 
       AND created_at < $1`,
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

    res.json({
      message: `Auto-cancelled ${cancelledBookings.length} pending booking(s)`,
      cancelled: cancelledBookings
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error auto-cancelling bookings:', error);
    res.status(500).json({ error: 'Failed to auto-cancel bookings' });
  } finally {
    client.release();
  }
});

module.exports = router;

