const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');
const chargeAccountingService = require('../services/chargeAccountingService');
const bookingCalculationService = require('../services/bookingCalculationService');

// GET all bookings
router.get('/', async (req, res) => {
  try {
    const { status, search, limit, offset } = req.query;
    const bookings = await bookingService.getBookingsList({
      status,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET bookings by product ID (for availability checking)
router.get('/by-product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const bookings = await bookingService.getBookingsByProductId(parseInt(productId));
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings by product:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET booking by ID with financial summary
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bookingId = parseInt(id);

    // Get booking details
    const booking = await bookingService.getBookingById(bookingId);

    // Get payment summary
    const paymentSummary = await chargeAccountingService.getPaymentSummary(bookingId);

    // Combine both
    const response = {
      ...booking,
      payment_summary: paymentSummary
    };

    res.json(response);
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// POST create booking
router.post('/', async (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      booking_date,
      products,
      transport_charge = 0,
      created_by,
      discount_amount = 0
    } = req.body;

    // Validate required fields
    if (!customer_name || !customer_phone || !booking_date || !products || products.length === 0) {
      return res.status(400).json({
        error: 'Required fields missing',
        required: ['customer_name', 'customer_phone', 'booking_date', 'products']
      });
    }

    // Fetch product details and calculate discounts using shared service
    const productIds = products.map(p => p.id || p.product_id);
    const productMap = await bookingCalculationService.fetchProductDetails(productIds);

    // Transform product data with fetched details and calculated discounts
    const transformedProducts = products.map(p => {
      const productId = p.id || p.product_id;
      const productDetails = productMap[productId];

      if (!productDetails) {
        throw new Error(`Product with id ${productId} not found`);
      }

      return {
        productId,
        bookedFrom: p.booked_from,
        bookedTo: p.booked_to,
        rent: productDetails.rent,
        securityDeposit: productDetails.security_deposit,
        quantity: p.quantity || 1,
        measurements: p.measurements,
        specialRequirements: p.special_requirements,
        discountType: p.discountType || null,
        discountValue: p.discountValue || 0
      };
    });

    // Create booking using service (it will call DiscountCalculator internally)
    const result = await bookingService.createBooking({
      customerName: customer_name,
      customerPhone: customer_phone,
      customerEmail: customer_email,
      customerAddress: customer_address,
      bookingDate: booking_date,
      products: transformedProducts,
      transportCharge: transport_charge,
      createdBy: created_by,
      discountAmount: Math.floor(parseInt(discount_amount) || 0)
    });

    // Fetch complete booking details to return
    const booking = await bookingService.getBookingById(result.booking_id);

    res.status(201).json(booking);
  } catch (error) {
    console.error('Error creating booking:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to create booking',
      details: error.message
    });
  }
});

// PUT update booking — handles status changes, measurements, and special requirements
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bookingService.updateBooking(parseInt(id), req.body);
    res.json(result);
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message.startsWith('Invalid status')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});



// PUT confirm booking
router.put('/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmed_by } = req.body;

    const result = await bookingService.confirmBooking(parseInt(id), confirmed_by || 'system');

    res.json(result);
  } catch (error) {
    if (error.message.includes('Cannot confirm')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error confirming booking:', error);
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

// POST finalize booking with optional final discount
router.post('/:id/finalize', async (req, res) => {
  try {
    const { id } = req.params;
    const { final_discount, finalized_by } = req.body;

    const finalDiscount = final_discount || 0;

    if (finalDiscount < 0) {
      return res.status(400).json({
        error: 'final_discount must be >= 0'
      });
    }

    const result = await bookingService.finalizeBooking(
      parseInt(id),
      finalDiscount,
      finalized_by || 'system'
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message.includes('Cannot finalize')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error finalizing booking:', error);
    res.status(500).json({ error: 'Failed to finalize booking', details: error.message });
  }
});

// PUT update booking status (check if should be completed/cancelled)
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await bookingService.updateBookingStatus(parseInt(id));

    res.json(result);
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

// DELETE booking
router.delete('/:id', async (req, res) => {
  const pool = require('../database/connection');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { id } = req.params;

    // Verify booking exists
    const bookingResult = await client.query(
      'SELECT id FROM bookings WHERE id = $1',
      [id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Delete booking (cascade will handle related records)
    await client.query('DELETE FROM bookings WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ message: 'Booking deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  } finally {
    client.release();
  }
});

// PUT update booking discount (create, update, or remove booking-level discount)
router.put('/:id/discount', async (req, res) => {
  try {
    const { id } = req.params;
    const { discount_amount, updated_by } = req.body;

    if (discount_amount === undefined || !updated_by) {
      return res.status(400).json({
        error: 'Required: discount_amount (>= 0), updated_by'
      });
    }

    const parsedAmount = Math.floor(parseInt(discount_amount) || 0);
    if (parsedAmount < 0) {
      return res.status(400).json({ error: 'discount_amount must be >= 0' });
    }

    const result = await chargeAccountingService.updateBookingDiscount(
      parseInt(id),
      parsedAmount,
      updated_by
    );

    res.json({
      success: true,
      message: `Discount updated: ₹${result.old_discount} → ₹${result.new_discount}`,
      ...result
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message === 'Discount amount unchanged') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating discount:', error);
    res.status(500).json({ error: 'Failed to update discount', details: error.message });
  }
});

// GET activity log for a booking
router.get('/:id/activity-log', async (req, res) => {
  try {
    const { id } = req.params;

    const activityLog = await bookingService.getActivityLog(parseInt(id));

    res.json({
      success: true,
      booking_id: parseInt(id),
      activities: activityLog,
      count: activityLog.length
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error fetching activity log:', error);
    res.status(500).json({ error: 'Failed to fetch activity log', details: error.message });
  }
});

module.exports = router;
