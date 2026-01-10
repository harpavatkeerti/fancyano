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
              'security_deposit', p.security_deposit,
              'image', p.image,
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
              'security_deposit', p.security_deposit,
              'image', p.image,
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

    const booking = result.rows[0];
    
    // Debug: Log product images
    if (booking.products && Array.isArray(booking.products)) {
      console.log('📦 Booking products with images:');
      booking.products.forEach((product, index) => {
        console.log(`  Product ${index + 1}:`, {
          id: product.id,
          name: product.name,
          code: product.code,
          image: product.image,
          imageType: typeof product.image
        });
      });
    }

    res.json(booking);
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

    const { customer_name, customer_phone, alternate_phone, customer_address, booking_date, booked_from, booked_to, products, total_amount, security_deposit, created_by, transportation_opted, other_charges } = req.body;

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
    // Use status from request if provided, otherwise default to 'pending'
    const bookingStatus = req.body.status || 'pending';
    
    const bookingResult = await client.query(
      'INSERT INTO bookings (customer_name, customer_phone, alternate_phone, customer_address, booking_date, booked_from, booked_to, total_amount, security_deposit, status, created_by, transportation_opted, other_charges) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *',
      [customer_name, customer_phone || null, alternate_phone || null, customer_address || null, booking_date, finalBookedFrom, finalBookedTo, total_amount || null, security_deposit || 0, bookingStatus, created_by || null, transportation_opted || false, other_charges || 0]
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
              'security_deposit', p.security_deposit,
              'image', p.image,
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
    console.error('❌ Error creating booking:', error);
    console.error('   Error message:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Error detail:', error.detail);
    console.error('   Error hint:', error.hint);
    
    // Send detailed error to frontend
    const errorMessage = error.message || 'Unknown error occurred';
    const errorDetail = error.detail || '';
    const errorHint = error.hint || '';
    
    res.status(500).json({ 
      error: 'Failed to create booking',
      details: errorMessage,
      detail: errorDetail,
      hint: errorHint,
      code: error.code
    });
  } finally {
    client.release();
  }
});

// PUT update booking
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== UPDATE BOOKING ===');
    console.log('ID:', id);
    console.log('paid_amount in body:', req.body.paid_amount);
    console.log('due_amount in body:', req.body.due_amount);
    console.log('payment_status in body:', req.body.payment_status);
    
    const { 
      customer_name, 
      customer_phone, 
      alternate_phone, 
      customer_address, 
      booked_from, 
      booked_to, 
      status, 
      total_amount,
      other_charges,
      paid_amount,
      due_amount,
      payment_status,
      measurements,
      products
    } = req.body;

    // Build dynamic query based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (customer_name !== undefined) {
      updates.push(`customer_name = $${paramCount++}`);
      values.push(customer_name);
    }
    if (customer_phone !== undefined) {
      updates.push(`customer_phone = $${paramCount++}`);
      values.push(customer_phone);
    }
    if (alternate_phone !== undefined) {
      updates.push(`alternate_phone = $${paramCount++}`);
      values.push(alternate_phone);
    }
    if (customer_address !== undefined) {
      updates.push(`customer_address = $${paramCount++}`);
      values.push(customer_address);
    }
    if (booked_from !== undefined) {
      updates.push(`booked_from = $${paramCount++}`);
      values.push(booked_from);
    }
    if (booked_to !== undefined) {
      updates.push(`booked_to = $${paramCount++}`);
      values.push(booked_to);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (total_amount !== undefined) {
      updates.push(`total_amount = $${paramCount++}`);
      values.push(total_amount);
    }
    if (other_charges !== undefined) {
      console.log('Adding other_charges to update:', other_charges);
      updates.push(`other_charges = $${paramCount++}`);
      values.push(other_charges);
    }
    if (paid_amount !== undefined) {
      console.log('Adding paid_amount to update:', paid_amount);
      updates.push(`paid_amount = $${paramCount++}`);
      values.push(paid_amount);
    }
    if (due_amount !== undefined) {
      console.log('Adding due_amount to update:', due_amount);
      updates.push(`due_amount = $${paramCount++}`);
      values.push(due_amount);
    }
    if (payment_status !== undefined) {
      console.log('Adding payment_status to update:', payment_status);
      updates.push(`payment_status = $${paramCount++}`);
      values.push(payment_status);
    }
    if (measurements !== undefined) {
      console.log('Adding measurements to update:', measurements);
      updates.push(`measurements = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(measurements));
    }
    if (req.body.special_requirements !== undefined) {
      console.log('Adding special_requirements to update:', req.body.special_requirements);
      // If it's already a string (JSON stringified), use it directly, otherwise stringify
      const specialReqsValue = typeof req.body.special_requirements === 'string' 
        ? req.body.special_requirements 
        : JSON.stringify(req.body.special_requirements);
      updates.push(`special_requirements = $${paramCount++}::jsonb`);
      values.push(specialReqsValue);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    console.log('Query:', query);
    console.log('Values:', values);
    
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // If status is being changed to 'completed', free all products from booking_products
    // This makes all products available for other bookings
    if (status === 'completed') {
      const freedProducts = await pool.query(
        `DELETE FROM booking_products 
         WHERE booking_id = $1
         RETURNING product_id, booked_from, booked_to`,
        [id]
      );
      
      if (freedProducts.rows.length > 0) {
        console.log(`✅ Booking ${id} completed - Freed ${freedProducts.rows.length} product(s):`);
        freedProducts.rows.forEach((p, idx) => {
          console.log(`   ${idx + 1}. Product ID: ${p.product_id} (${p.booked_from} to ${p.booked_to})`);
        });
      }
    }

    // Update product dates if provided
    if (products && Array.isArray(products) && products.length > 0) {
      console.log('Updating product dates:', products);
      
      // Update each product's dates in booking_products table
      for (const product of products) {
        if (product.id && product.booked_from && product.booked_to) {
          await pool.query(
            'UPDATE booking_products SET booked_from = $1, booked_to = $2 WHERE booking_id = $3 AND product_id = $4',
            [product.booked_from, product.booked_to, id, product.id]
          );
          console.log(`Updated product ${product.id} dates: ${product.booked_from} to ${product.booked_to}`);
        }
      }
      
      // Recalculate booking-level dates from products
      const productDatesResult = await pool.query(
        `SELECT MIN(booked_from) as earliest_from, MAX(booked_to) as latest_to 
         FROM booking_products 
         WHERE booking_id = $1 
         AND booked_from IS NOT NULL 
         AND booked_to IS NOT NULL`,
        [id]
      );
      
      if (productDatesResult.rows[0] && productDatesResult.rows[0].earliest_from) {
        await pool.query(
          'UPDATE bookings SET booked_from = $1, booked_to = $2 WHERE id = $3',
          [productDatesResult.rows[0].earliest_from, productDatesResult.rows[0].latest_to, id]
        );
        console.log(`Updated booking-level dates: ${productDatesResult.rows[0].earliest_from} to ${productDatesResult.rows[0].latest_to}`);
      }
    }

    console.log('Updated booking paid_amount:', result.rows[0].paid_amount);
    console.log('===================');
    
    // Fetch complete booking with updated products
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
              'security_deposit', p.security_deposit,
              'image', p.image,
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
    
    res.json(completeBooking.rows[0]);
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// DELETE booking
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    
    // Get booking details before deletion to check products
    const bookingResult = await client.query(
      'SELECT * FROM bookings WHERE id = $1',
      [id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Delete booking (cascade will delete booking_products)
    const deleteResult = await client.query(
      'DELETE FROM bookings WHERE id = $1 RETURNING *',
      [id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Booking deleted successfully', booking: deleteResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  } finally {
    client.release();
  }
});

// POST add product to booking
router.post('/:id/products', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { product_id, booked_from, booked_to } = req.body;
    
    if (!product_id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    
    // Check if booking exists
    const bookingResult = await client.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [id]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    // Check if product is already in booking
    const existingProduct = await client.query(
      'SELECT id FROM booking_products WHERE booking_id = $1 AND product_id = $2',
      [id, product_id]
    );
    
    if (existingProduct.rows.length > 0) {
      return res.status(400).json({ error: 'Product is already in this booking' });
    }
    
    // Add product to booking
    await client.query(
      'INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to) VALUES ($1, $2, $3, $4)',
      [id, product_id, booked_from || booking.booked_from, booked_to || booking.booked_to]
    );
    
    // Recalculate booking totals
    const recalcResult = await client.query(
      `SELECT 
        COALESCE(SUM(p.rent_per_day), 0) as total_rent,
        COALESCE(SUM(p.security_deposit), 0) as total_security
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1`,
      [id]
    );
    
    const newTotalRent = parseFloat(recalcResult.rows[0].total_rent) || 0;
    const newTotalSecurity = parseFloat(recalcResult.rows[0].total_security) || 0;
    
    // Update booking with recalculated totals
    await client.query(
      `UPDATE bookings 
       SET total_amount = $1,
           security_deposit = $2,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [newTotalRent, newTotalSecurity, id]
    );
    
    await client.query('COMMIT');
    
    res.json({ message: 'Product added to booking successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding product to booking:', error);
    res.status(500).json({ error: 'Failed to add product to booking' });
  } finally {
    client.release();
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

