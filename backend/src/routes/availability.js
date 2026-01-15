const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// POST check product availability for given dates
router.post('/check', async (req, res) => {
  try {
    const { product_id, date_from, date_to } = req.body;
    
    if (!product_id || !date_from || !date_to) {
      return res.status(400).json({ error: 'product_id, date_from, and date_to are required' });
    }

    console.log(`🔍 Checking availability for product ${product_id} from ${date_from} to ${date_to}`);

    // Query bookings for this product that overlap with the requested dates
    // Exclude cancelled and completed bookings (but allow partially_cancelled as other products may still be active)
    // CRITICAL: Only check products with status = 'active' - this ensures cancelled products don't block dates
    const query = `
      SELECT 
        b.id,
        b.customer_name,
        b.status,
        bp.booked_from,
        bp.booked_to,
        bp.status as product_status
      FROM bookings b
      JOIN booking_products bp ON b.id = bp.booking_id
      WHERE 
        bp.product_id = $1
        AND b.status NOT IN ('cancelled', 'completed')
        AND bp.status = 'active'
        AND (
          (bp.booked_from <= $2 AND bp.booked_to >= $2) OR
          (bp.booked_from <= $3 AND bp.booked_to >= $3) OR
          (bp.booked_from >= $2 AND bp.booked_to <= $3)
        )
      ORDER BY bp.booked_from
    `;

    const result = await pool.query(query, [product_id, date_from, date_to]);

    if (result.rows.length > 0) {
      // Product is not available
      const conflicts = result.rows.map(row => ({
        booking_id: row.id,
        customer: row.customer_name,
        status: row.status,
        from: row.booked_from,
        to: row.booked_to
      }));

      console.log(`❌ Product ${product_id} is NOT available. ${conflicts.length} conflict(s) found.`);

      return res.json({
        available: false,
        conflicts: conflicts,
        message: `Product is already booked from ${conflicts[0].from} to ${conflicts[0].to}`
      });
    }

    console.log(`✅ Product ${product_id} is available!`);

    res.json({
      available: true,
      conflicts: [],
      message: 'Product is available for the selected dates'
    });

  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// POST bulk check availability for multiple products
router.post('/check-bulk', async (req, res) => {
  try {
    const { products } = req.body; // Array of { product_id, date_from, date_to }
    
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'products array is required' });
    }

    const results = [];

    for (const item of products) {
      const { product_id, date_from, date_to } = item;
      
      if (!product_id || !date_from || !date_to) {
        results.push({
          product_id,
          available: false,
          error: 'Missing required fields'
        });
        continue;
      }

      const query = `
        SELECT 
          b.id,
          b.customer_name,
          b.status,
          bp.booked_from,
          bp.booked_to,
          bp.status as product_status
        FROM bookings b
        JOIN booking_products bp ON b.id = bp.booking_id
        WHERE 
          bp.product_id = $1
          AND b.status NOT IN ('cancelled', 'completed')
          AND bp.status = 'active'
          AND (
            (bp.booked_from <= $2 AND bp.booked_to >= $2) OR
            (bp.booked_from <= $3 AND bp.booked_to >= $3) OR
            (bp.booked_from >= $2 AND bp.booked_to <= $3)
          )
      `;

      const result = await pool.query(query, [product_id, date_from, date_to]);

      if (result.rows.length > 0) {
        const conflicts = result.rows.map(row => ({
          booking_id: row.id,
          customer: row.customer_name,
          from: row.booked_from,
          to: row.booked_to
        }));

        results.push({
          product_id,
          available: false,
          conflicts: conflicts,
          message: `Product is already booked`
        });
      } else {
        results.push({
          product_id,
          available: true,
          conflicts: [],
          message: 'Available'
        });
      }
    }

    res.json({
      results: results,
      all_available: results.every(r => r.available)
    });

  } catch (error) {
    console.error('Error checking bulk availability:', error);
    res.status(500).json({ error: 'Failed to check bulk availability' });
  }
});

module.exports = router;

