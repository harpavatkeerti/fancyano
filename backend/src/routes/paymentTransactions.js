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
      
      // If this is a REFUND transaction, check if it's for a specific product's security deposit
      // If so, free that product from booking_products (mark as completed/returned)
      if (type === 'refund' && method === 'refund' && notes) {
        // Parse notes to extract product ID or code
        // Notes format examples:
        // "Security deposit refund for Product ID: 28 (Sherwani SH-001)"
        // "Refund for Product: Sherwani SH-001"
        
        const productIdMatch = notes.match(/Product ID[:\s]+(\d+)/i);
        const productCodeMatch = notes.match(/\(([A-Z]+-\d+)\)/);
        
        let productToFree = null;
        
        if (productIdMatch) {
          const productId = parseInt(productIdMatch[1]);
          const productCheck = await client.query(
            'SELECT id, code, name FROM products WHERE id = $1',
            [productId]
          );
          if (productCheck.rows.length > 0) {
            productToFree = productCheck.rows[0];
          }
        } else if (productCodeMatch) {
          const productCode = productCodeMatch[1];
          const productCheck = await client.query(
            'SELECT id, code, name FROM products WHERE code = $1',
            [productCode]
          );
          if (productCheck.rows.length > 0) {
            productToFree = productCheck.rows[0];
          }
        }
        
        // DON'T free products here - they will be freed when booking status becomes "completed"
        // This prevents wrong calculations when status is recalculated after refund
        // if (productToFree) {
        //   const freedProduct = await client.query(
        //     `DELETE FROM booking_products 
        //      WHERE booking_id = $1 AND product_id = $2
        //      RETURNING product_id, booked_from, booked_to`,
        //     [booking_id, productToFree.id]
        //   );
        //   
        //   if (freedProduct.rows.length > 0) {
        //     const freed = freedProduct.rows[0];
        //     console.log(`✅ Freed product ${productToFree.name} (${productToFree.code}) from booking ${booking_id}`);
        //     console.log(`   Dates freed: ${freed.booked_from} to ${freed.booked_to}`);
        //   }
        // }
      }
      
      // Update booking paid_amount ONLY for payment and refund types
      // date_change_charge, exchange_penalty, and adjustments do NOT affect payment calculations
      // Exchange penalties are collected separately and should not be counted in paid_amount
      // Adjustments are changes to booking total, not payments received
      if (type !== 'date_change_charge' && 
          type !== 'adjustment' &&
          method !== 'exchange_penalty' && 
          method !== 'exchange') {
        // For payments: add to paid_amount
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
        SUM(CASE 
          WHEN type = 'payment' 
          AND (method IS NULL OR (method != 'exchange_penalty' AND method != 'exchange'))
          AND (notes IS NULL OR (LOWER(notes) NOT LIKE '%exchange penalty%' AND LOWER(notes) NOT LIKE '%exchange charge%'))
          THEN amount 
          ELSE 0 
        END) as total_payments,
        SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) as total_refunds,
        SUM(CASE WHEN type = 'adjustment' THEN amount ELSE 0 END) as total_adjustments,
        SUM(CASE WHEN type = 'date_change_charge' THEN amount ELSE 0 END) as total_date_change_charges,
        SUM(CASE 
          WHEN method = 'exchange_penalty' 
          OR method = 'exchange'
          OR (notes IS NOT NULL AND (LOWER(notes) LIKE '%exchange penalty%' OR LOWER(notes) LIKE '%exchange charge%'))
          THEN amount 
          ELSE 0 
        END) as total_exchange_penalties,
        SUM(CASE 
          -- CRITICAL: Exclude ALL refunds from net_amount calculation
          -- Since exchanges are only allowed when new rent >= old rent, refunds should not affect the balance
          WHEN type = 'refund' THEN 0
          WHEN type = 'date_change_charge' THEN 0
          WHEN method = 'exchange_penalty' OR method = 'exchange' THEN 0
          WHEN notes IS NOT NULL AND (LOWER(notes) LIKE '%exchange penalty%' OR LOWER(notes) LIKE '%exchange charge%') THEN 0
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

