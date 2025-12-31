const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// GET all bookings
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT 
        b.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', p.id,
              'name', p.name,
              'code', p.code,
              'rent_per_day', p.rent_per_day,
              'booked_from', bp.booked_from,
              'booked_to', bp.booked_to
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as products
      FROM bookings b
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND b.status = $${paramCount}`;
      params.push(status);
    }

    if (search) {
      paramCount++;
      query += ` AND (b.customer_name ILIKE $${paramCount} OR b.customer_phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' GROUP BY b.id ORDER BY b.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET booking by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT 
        b.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', p.id,
              'name', p.name,
              'code', p.code,
              'rent_per_day', p.rent_per_day,
              'booked_from', bp.booked_from,
              'booked_to', bp.booked_to
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as products
      FROM bookings b
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      WHERE b.id = $1
      GROUP BY b.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// POST create booking
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { customer_name, customer_phone, alternate_phone, customer_address, booking_date, booked_from, booked_to, products, total_amount } = req.body;

    if (!customer_name || !booking_date || !products || products.length === 0) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    // Log products for debugging
    console.log('Products received:', JSON.stringify(products, null, 2));

    // Calculate booking-level dates from products (earliest pickup, latest return)
    const productDates = products.filter(p => {
      // Check if dates exist and are not empty strings
      const hasFrom = p.booked_from && p.booked_from.trim() !== '';
      const hasTo = p.booked_to && p.booked_to.trim() !== '';
      return hasFrom && hasTo;
    });
    
    console.log('Products with valid dates:', productDates.length, 'out of', products.length);
    
    if (productDates.length === 0) {
      return res.status(400).json({ 
        error: 'At least one product must have dates',
        details: 'Please ensure pickup and return dates are set for all products'
      });
    }

    const earliestPickup = productDates.reduce((earliest, p) => 
      !earliest || new Date(p.booked_from) < new Date(earliest) ? p.booked_from : earliest, null
    );
    const latestReturn = productDates.reduce((latest, p) => 
      !latest || new Date(p.booked_to) > new Date(latest) ? p.booked_to : latest, null
    );

    const finalBookedFrom = booked_from || earliestPickup;
    const finalBookedTo = booked_to || latestReturn;

    // Create booking (use calculated dates)
    const bookingResult = await client.query(
      'INSERT INTO bookings (customer_name, customer_phone, alternate_phone, customer_address, booking_date, booked_from, booked_to, total_amount, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [customer_name, customer_phone || null, alternate_phone || null, customer_address || null, booking_date, finalBookedFrom, finalBookedTo, total_amount || null, 'pending']
    );

    const booking = bookingResult.rows[0];

    // Add products to booking with individual dates
    for (const product of products) {
      await client.query(
        'INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to) VALUES ($1, $2, $3, $4)',
        [booking.id, product.id, product.booked_from, product.booked_to]
      );
    }

    await client.query('COMMIT');

    // Fetch complete booking with products
    const completeBooking = await pool.query(
      `SELECT 
        b.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', p.id,
              'name', p.name,
              'code', p.code,
              'rent_per_day', p.rent_per_day,
              'booked_from', bp.booked_from,
              'booked_to', bp.booked_to
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as products
      FROM bookings b
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      WHERE b.id = $1
      GROUP BY b.id`,
      [booking.id]
    );

    res.status(201).json(completeBooking.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  } finally {
    client.release();
  }
});

// PUT update booking
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_name, customer_phone, alternate_phone, customer_address, booked_from, booked_to, status, total_amount } = req.body;

    const result = await pool.query(
      'UPDATE bookings SET customer_name = $1, customer_phone = $2, alternate_phone = $3, customer_address = $4, booked_from = $5, booked_to = $6, status = $7, total_amount = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9 RETURNING *',
      [customer_name, customer_phone, alternate_phone, customer_address, booked_from, booked_to, status, total_amount, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// DELETE booking
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM bookings WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ message: 'Booking deleted successfully' });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// GET bookings for a specific product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const query = `
      SELECT 
        b.id,
        b.customer_name,
        b.customer_phone,
        bp.booked_from,
        bp.booked_to,
        b.status
      FROM bookings b
      INNER JOIN booking_products bp ON b.id = bp.booking_id
      WHERE bp.product_id = $1
        AND b.status NOT IN ('cancelled', 'completed')
        AND bp.booked_from IS NOT NULL
        AND bp.booked_to IS NOT NULL
      ORDER BY bp.booked_from ASC
    `;
    
    const result = await pool.query(query, [productId]);
    console.log(`📅 Fetching bookings for product ${productId}:`, result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching product bookings:', error);
    res.status(500).json({ error: 'Failed to fetch product bookings' });
  }
});

module.exports = router;

