const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// Tracking statuses that can only be set by the booking lifecycle service
const LIFECYCLE_ONLY_STATUSES = ['in_house', 'picked_by_customer'];

// Valid statuses that the Track modal can create via POST
const MANUAL_TRACKING_STATUSES = [
  'going_to_dry_clean',
  'alternation_related_work',
  'repair',
  'other_work'
];

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
        b.id as booking_ref_id
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

// Get current (latest) tracking record for a product
router.get('/current/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await pool.query(`
      SELECT
        pt.*,
        p.name as product_name,
        p.code as product_code_ref,
        p.size as product_size,
        b.customer_name,
        b.id as booking_ref_id
      FROM product_tracking pt
      LEFT JOIN products p ON pt.product_id = p.id
      LEFT JOIN bookings b ON pt.booking_id = b.id
      WHERE pt.product_id = $1
      ORDER BY pt.created_at DESC
      LIMIT 1
    `, [productId]);
    // null means no history — product is implicitly in_house
    res.json({ data: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching current tracking:', error);
    res.status(500).json({ error: 'Failed to fetch current tracking record' });
  }
});

// Get tracking records by product ID (history)
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

// Get tracking records by product code (history)
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

// Create new tracking record (manual tracking via Track modal only)
// in_house and picked_by_customer are set exclusively by the lifecycle service
router.post('/', async (req, res) => {
  try {
    const {
      product_id,
      booking_id,
      product_code,
      tracking_status,
      work_description,
      notes
    } = req.body;

    // Validate required fields
    if (!product_code || !tracking_status) {
      return res.status(400).json({ error: 'product_code and tracking_status are required' });
    }

    // Only manual statuses allowed via this endpoint
    if (!MANUAL_TRACKING_STATUSES.includes(tracking_status)) {
      return res.status(400).json({
        error: `tracking_status '${tracking_status}' is not allowed via this endpoint. ` +
               `Must be one of: ${MANUAL_TRACKING_STATUSES.join(', ')}. ` +
               `'in_house' and 'picked_by_customer' are managed by the booking lifecycle.`
      });
    }

    // work_description required for other_work
    if (tracking_status === 'other_work' && !work_description) {
      return res.status(400).json({ error: 'work_description is required for other_work' });
    }

    const result = await pool.query(
      `INSERT INTO product_tracking
        (product_id, booking_id, product_code, tracking_status, work_description, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [product_id, booking_id || null, product_code, tracking_status, work_description || null, notes || null]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error creating tracking record:', error);
    res.status(500).json({ error: 'Failed to create tracking record' });
  }
});

// Get currently "out" tracking records — products whose LATEST tracking_status != in_house
// IMPORTANT: this must be before /:id routes so Express doesn't treat 'active' as an id
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        latest.*,
        p.name  AS product_name,
        p.code  AS product_code_ref,
        p.size  AS product_size,
        b.customer_name
      FROM (
        SELECT DISTINCT ON (product_id) *
        FROM product_tracking
        ORDER BY product_id, created_at DESC
      ) latest
      LEFT JOIN products p ON latest.product_id = p.id
      LEFT JOIN bookings b ON latest.booking_id  = b.id
      WHERE latest.tracking_status != 'in_house'
      ORDER BY latest.created_at DESC
    `);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching active tracking records:', error);
    res.status(500).json({ error: 'Failed to fetch active tracking records' });
  }
});

// Mark a product as returned — inserts a new in_house row (preserves history)
// The :id is the ID of the current "out" record; used to look up product_id/product_code
router.patch('/:id/return', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Look up the existing record to get product_id and product_code
    const existing = await pool.query(
      'SELECT product_id, product_code FROM product_tracking WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Tracking record not found' });
    }

    const { product_id, product_code } = existing.rows[0];

    // Insert a new in_house row (keeps full audit history)
    const result = await pool.query(
      `INSERT INTO product_tracking
        (product_id, product_code, tracking_status, notes)
       VALUES ($1, $2, 'in_house', $3)
       RETURNING *`,
      [product_id, product_code, notes || null]
    );

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error marking tracking record as returned:', error);
    res.status(500).json({ error: 'Failed to mark as returned' });
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

module.exports = router;
