const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// Get all tracking records
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pt.*,
        p.name as product_name,
        p.code as product_code_ref,
        p.size as product_size,
        b.customer_name,
        b.id as booking_id
      FROM product_tracking pt
      LEFT JOIN products p ON pt.product_id = p.id
      LEFT JOIN bookings b ON pt.booking_id = b.id
      ORDER BY pt.created_at DESC
    `);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching product tracking:', error);
    res.status(500).json({ error: 'Failed to fetch product tracking records' });
  }
});

// Get tracking records by product ID
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await pool.query(`
      SELECT 
        pt.*,
        p.name as product_name,
        p.code as product_code_ref,
        p.size as product_size,
        b.customer_name
      FROM product_tracking pt
      LEFT JOIN products p ON pt.product_id = p.id
      LEFT JOIN bookings b ON pt.booking_id = b.id
      WHERE pt.product_id = $1
      ORDER BY pt.created_at DESC
    `, [productId]);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching product tracking:', error);
    res.status(500).json({ error: 'Failed to fetch product tracking records' });
  }
});

// Get tracking records by product code
router.get('/code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await pool.query(`
      SELECT 
        pt.*,
        p.name as product_name,
        p.code as product_code_ref,
        p.size as product_size,
        b.customer_name
      FROM product_tracking pt
      LEFT JOIN products p ON pt.product_id = p.id
      LEFT JOIN bookings b ON pt.booking_id = b.id
      WHERE pt.product_code = $1
      ORDER BY pt.created_at DESC
    `, [code]);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching product tracking:', error);
    res.status(500).json({ error: 'Failed to fetch product tracking records' });
  }
});

// Create new tracking record
router.post('/', async (req, res) => {
  try {
    const {
      product_id,
      booking_id,
      product_code,
      tracking_type,
      work_description,
      notes
    } = req.body;

    // Validate required fields
    if (!product_code || !tracking_type) {
      return res.status(400).json({ error: 'Product code and tracking type are required' });
    }

    // If tracking_type is 'other_work', work_description is required
    if (tracking_type === 'other_work' && !work_description) {
      return res.status(400).json({ error: 'Work description is required for other work type' });
    }

    const result = await pool.query(
      `INSERT INTO product_tracking 
        (product_id, booking_id, product_code, tracking_type, work_description, notes, status, out_date)
      VALUES ($1, $2, $3, $4, $5, $6, 'out', CURRENT_TIMESTAMP)
      RETURNING *`,
      [product_id, booking_id, product_code, tracking_type, work_description, notes]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error creating tracking record:', error);
    res.status(500).json({ error: 'Failed to create tracking record' });
  }
});

// Update tracking record (mark as returned)
router.patch('/:id/return', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await pool.query(
      `UPDATE product_tracking 
      SET status = 'returned', 
          return_date = CURRENT_TIMESTAMP,
          notes = COALESCE($2, notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`,
      [id, notes]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tracking record not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error updating tracking record:', error);
    res.status(500).json({ error: 'Failed to update tracking record' });
  }
});

// Delete tracking record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM product_tracking WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tracking record not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting tracking record:', error);
    res.status(500).json({ error: 'Failed to delete tracking record' });
  }
});

// Get active (out) tracking records
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pt.*,
        p.name as product_name,
        p.code as product_code_ref,
        p.size as product_size,
        b.customer_name
      FROM product_tracking pt
      LEFT JOIN products p ON pt.product_id = p.id
      LEFT JOIN bookings b ON pt.booking_id = b.id
      WHERE pt.status = 'out'
      ORDER BY pt.created_at DESC
    `);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching active tracking records:', error);
    res.status(500).json({ error: 'Failed to fetch active tracking records' });
  }
});

module.exports = router;

