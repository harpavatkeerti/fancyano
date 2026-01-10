const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// POST cancel booking
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const {
      booking_id,
      cancellation_reason,
      cancelled_by,
      cancellation_date
    } = req.body;
    
    if (!booking_id) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }
    
    // Fetch booking details
    const bookingResult = await client.query(
      `SELECT b.*, 
              COALESCE(SUM(CAST(pt.amount AS DECIMAL)), 0) as total_paid
       FROM bookings b
       LEFT JOIN payment_transactions pt ON b.id = pt.booking_id 
         AND pt.type = 'payment' 
         AND pt.method NOT IN ('exchange_lapsed', 'lapsed_refund')
       WHERE b.id = $1
       GROUP BY b.id`,
      [booking_id]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    // Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }
    
    // Check if booking is completed
    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel completed booking' });
    }
    
    const bookingDate = new Date(booking.booking_date);
    const cancellationDateObj = cancellation_date ? new Date(cancellation_date) : new Date();
    
    // Calculate days from booking date
    const daysDiff = Math.floor((cancellationDateObj - bookingDate) / (1000 * 60 * 60 * 24));
    
    console.log('📅 CANCELLATION REQUEST:');
    console.log(`  Booking ID: ${booking_id}`);
    console.log(`  Booking Date: ${bookingDate.toISOString().split('T')[0]}`);
    console.log(`  Cancellation Date: ${cancellationDateObj.toISOString().split('T')[0]}`);
    console.log(`  Days from booking: ${daysDiff}`);
    
    // Fetch cancellation policy
    let cancellationPolicy = null;
    let penaltyPercentage = 0;
    
    try {
      const policyResult = await client.query(
        'SELECT setting_value FROM settings WHERE setting_key = $1',
        ['cancellation_policy']
      );
      if (policyResult.rows.length > 0) {
        cancellationPolicy = JSON.parse(policyResult.rows[0].setting_value);
        console.log('📋 Cancellation Policy:', cancellationPolicy);
      }
    } catch (error) {
      console.error('Error fetching cancellation policy:', error);
    }
    
    // Calculate penalty percentage based on cancellation policy
    if (cancellationPolicy && cancellationPolicy.days) {
      const days = cancellationPolicy.days;
      const penalties = [
        cancellationPolicy.before_7_days || 0,
        cancellationPolicy.before_3_days || 0,
        cancellationPolicy.before_1_day || 0,
        cancellationPolicy.on_booking_date || 0
      ];
      
      if (daysDiff <= days[0]) {
        penaltyPercentage = penalties[0];
      } else if (daysDiff <= days[1]) {
        penaltyPercentage = penalties[1];
      } else if (daysDiff <= days[2]) {
        penaltyPercentage = penalties[2];
      } else {
        penaltyPercentage = penalties[3];
      }
      
      console.log(`💰 Penalty Percentage: ${penaltyPercentage}%`);
    }
    
    // Calculate amounts
    const totalPaid = parseFloat(booking.total_paid) || 0;
    const totalAmount = parseFloat(booking.total_amount) || 0;
    const securityDeposit = parseFloat(booking.security_deposit) || 0;
    
    // Penalty is calculated on the total amount (rent + charges)
    const penaltyAmount = (totalAmount * penaltyPercentage) / 100;
    
    // Refund = Total Paid - Penalty
    const refundAmount = Math.max(0, totalPaid - penaltyAmount);
    
    console.log('💵 CANCELLATION CALCULATION:');
    console.log(`  Total Booking Amount: ₹${totalAmount}`);
    console.log(`  Total Paid: ₹${totalPaid}`);
    console.log(`  Penalty (${penaltyPercentage}%): ₹${penaltyAmount.toFixed(2)}`);
    console.log(`  Refund Amount: ₹${refundAmount.toFixed(2)}`);
    
    // Record penalty transaction if penalty > 0
    if (penaltyAmount > 0) {
      const penaltyNotes = `Cancellation penalty: ${penaltyPercentage}% penalty applied (${daysDiff} days from booking date) | Reason: ${cancellation_reason || 'Not specified'}`;
      
      await client.query(
        `INSERT INTO payment_transactions 
         (booking_id, amount, type, method, notes, recorded_by)
         VALUES ($1, $2, 'payment', 'cancellation_penalty', $3, $4)`,
        [
          booking_id,
          penaltyAmount,
          penaltyNotes,
          cancelled_by || 'system'
        ]
      );
      
      console.log(`✅ Recorded penalty transaction: ₹${penaltyAmount}`);
    }
    
    // Update booking status to cancelled
    await client.query(
      `UPDATE bookings 
       SET status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [booking_id]
    );
    
    console.log('✅ Booking status updated to cancelled');
    
    // Free up all products by deleting from booking_products
    // This makes the products available for other bookings on these dates
    const deletedProducts = await client.query(
      `DELETE FROM booking_products 
       WHERE booking_id = $1
       RETURNING product_id, booked_from, booked_to`,
      [booking_id]
    );
    
    console.log(`✅ Freed ${deletedProducts.rows.length} product(s) from booking_products:`);
    deletedProducts.rows.forEach((p, idx) => {
      console.log(`  ${idx + 1}. Product ID: ${p.product_id} (${p.booked_from} to ${p.booked_to})`);
    });
    
    await client.query('COMMIT');
    
    res.json({ 
      message: 'Booking cancelled successfully',
      cancellation_details: {
        penalty_percentage: penaltyPercentage,
        penalty_amount: penaltyAmount,
        refund_amount: refundAmount,
        total_paid: totalPaid
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  } finally {
    client.release();
  }
});

// GET cancellation preview (calculate without committing)
router.get('/preview/:booking_id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { booking_id } = req.params;
    
    // Fetch booking details
    const bookingResult = await client.query(
      `SELECT b.*, 
              COALESCE(SUM(CAST(pt.amount AS DECIMAL)), 0) as total_paid
       FROM bookings b
       LEFT JOIN payment_transactions pt ON b.id = pt.booking_id 
         AND pt.type = 'payment' 
         AND pt.method NOT IN ('exchange_lapsed', 'lapsed_refund')
       WHERE b.id = $1
       GROUP BY b.id`,
      [booking_id]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }
    
    const bookingDate = new Date(booking.booking_date);
    const today = new Date();
    const daysDiff = Math.floor((today - bookingDate) / (1000 * 60 * 60 * 24));
    
    // Fetch cancellation policy
    let cancellationPolicy = null;
    let penaltyPercentage = 0;
    
    try {
      const policyResult = await client.query(
        'SELECT setting_value FROM settings WHERE setting_key = $1',
        ['cancellation_policy']
      );
      if (policyResult.rows.length > 0) {
        cancellationPolicy = JSON.parse(policyResult.rows[0].setting_value);
      }
    } catch (error) {
      console.error('Error fetching cancellation policy:', error);
    }
    
    // Calculate penalty percentage
    if (cancellationPolicy && cancellationPolicy.days) {
      const days = cancellationPolicy.days;
      const penalties = [
        cancellationPolicy.before_7_days || 0,
        cancellationPolicy.before_3_days || 0,
        cancellationPolicy.before_1_day || 0,
        cancellationPolicy.on_booking_date || 0
      ];
      
      if (daysDiff <= days[0]) {
        penaltyPercentage = penalties[0];
      } else if (daysDiff <= days[1]) {
        penaltyPercentage = penalties[1];
      } else if (daysDiff <= days[2]) {
        penaltyPercentage = penalties[2];
      } else {
        penaltyPercentage = penalties[3];
      }
    }
    
    // Calculate amounts
    const totalPaid = parseFloat(booking.total_paid) || 0;
    const totalAmount = parseFloat(booking.total_amount) || 0;
    
    const penaltyAmount = (totalAmount * penaltyPercentage) / 100;
    const refundAmount = Math.max(0, totalPaid - penaltyAmount);
    
    res.json({
      booking_id: booking.id,
      booking_date: booking.booking_date,
      days_from_booking: daysDiff,
      total_amount: totalAmount,
      total_paid: totalPaid,
      penalty_percentage: penaltyPercentage,
      penalty_amount: penaltyAmount,
      refund_amount: refundAmount,
      policy: cancellationPolicy
    });
  } catch (error) {
    console.error('Error fetching cancellation preview:', error);
    res.status(500).json({ error: 'Failed to fetch cancellation preview' });
  } finally {
    client.release();
  }
});

module.exports = router;

