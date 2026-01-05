const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// GET all payment transactions for a booking
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM payment_transactions 
       WHERE booking_id = $1 
       ORDER BY created_at DESC`,
      [bookingId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payment transactions:', error);
    res.status(500).json({ error: 'Failed to fetch payment transactions' });
  }
});

// POST create a new payment transaction
router.post('/', async (req, res) => {
  try {
    const { booking_id, amount, type, method, recorded_by, notes } = req.body;
    
    // Validate required fields
    if (!booking_id || !amount || !type || !recorded_by) {
      return res.status(400).json({ 
        error: 'Missing required fields: booking_id, amount, type, recorded_by' 
      });
    }
    
    // Validate type
    if (!['payment', 'refund', 'adjustment', 'date_change_charge'].includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid type. Must be: payment, refund, adjustment, or date_change_charge' 
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert transaction
      const transactionResult = await client.query(
        `INSERT INTO payment_transactions 
         (booking_id, amount, type, method, recorded_by, notes) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [booking_id, amount, type, method, recorded_by, notes]
      );
      
      // Update booking paid_amount ONLY for payment, refund, and adjustment types
      // date_change_charge does NOT affect payment calculations
      if (type !== 'date_change_charge') {
        // For payments and adjustments: add to paid_amount
        // For refunds: subtract from paid_amount
        const amountChange = type === 'refund' ? -Math.abs(amount) : Math.abs(amount);
        
        await client.query(
          `UPDATE bookings 
           SET paid_amount = COALESCE(paid_amount, 0) + $1,
               due_amount = total_amount - (COALESCE(paid_amount, 0) + $1),
               payment_status = CASE 
                 WHEN (COALESCE(paid_amount, 0) + $1) >= total_amount THEN 'paid'
                 WHEN (COALESCE(paid_amount, 0) + $1) > 0 THEN 'partial'
                 ELSE 'unpaid'
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [amountChange, booking_id]
        );
      }
      
      await client.query('COMMIT');
      
      res.status(201).json(transactionResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating payment transaction:', error);
    res.status(500).json({ error: 'Failed to create payment transaction' });
  }
});

// GET payment summary for a booking
router.get('/summary/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        COUNT(*) as transaction_count,
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_payments,
        SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) as total_refunds,
        SUM(CASE WHEN type = 'adjustment' THEN amount ELSE 0 END) as total_adjustments,
        SUM(CASE WHEN type = 'date_change_charge' THEN amount ELSE 0 END) as total_date_change_charges,
        SUM(CASE 
          WHEN type = 'refund' THEN -amount 
          WHEN type = 'date_change_charge' THEN 0
          ELSE amount 
        END) as net_amount
       FROM payment_transactions 
       WHERE booking_id = $1`,
      [bookingId]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching payment summary:', error);
    res.status(500).json({ error: 'Failed to fetch payment summary' });
  }
});

module.exports = router;

