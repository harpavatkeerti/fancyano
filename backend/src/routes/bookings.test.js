const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const bookingService = require('../services/bookingService');
const chargeAccountingService = require('../services/chargeAccountingService');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/bookings', require('./bookings'));

describe('Bookings Routes', () => {
  let testBookingId;
  let testProductId;

  beforeAll(async () => {
    // Create test product
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['TEST-BOOK-001', 'Test Booking Product', 50000, 20000, 'test']
    );
    testProductId = productResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-ROUTE')`);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-ROUTE'))`);
    await pool.query(`DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-ROUTE')`);
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-ROUTE')`);
    await pool.query(`DELETE FROM bookings WHERE customer_phone = 'TEST-ROUTE'`);
    await pool.query(`DELETE FROM products WHERE code = 'TEST-BOOK-001'`);
  });

  afterEach(async () => {
    // Cleanup after each test
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-ROUTE')`);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-ROUTE'))`);
    await pool.query(`DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-ROUTE')`);
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-ROUTE')`);
    await pool.query(`DELETE FROM bookings WHERE customer_phone = 'TEST-ROUTE'`);
  });

  describe('POST /bookings', () => {
    it('should create a new booking', async () => {
      const response = await request(app)
        .post('/bookings')
        .send({
          customer_name: 'Test Customer',
          customer_phone: 'TEST-ROUTE',
          customer_email: 'test@example.com',
          customer_address: '123 Test St',
          booking_date: '2024-01-01',
          products: [
            {
              id: testProductId,
              booked_from: '2024-02-01',
              booked_to: '2024-02-05',
              rent: 50000,
              security_deposit: 20000
            }
          ],
          transport_charge: 5000,
          created_by: 'test-user'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.customer_name).toBe('Test Customer');
      expect(response.body.products).toHaveLength(1);

      testBookingId = response.body.id;
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/bookings')
        .send({
          customer_name: 'Test Customer'
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /bookings', () => {
    beforeEach(async () => {
      // Create a test booking
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-ROUTE',
        customerEmail: 'test@example.com',
        bookingDate: '2024-01-01',
        products: [
          {
            productId: testProductId,
            bookedFrom: '2024-02-01',
            bookedTo: '2024-02-05',
            rent: 50000,
            securityDeposit: 20000
          }
        ],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      testBookingId = result.booking_id;
    });

    it('should return list of bookings', async () => {
      const response = await request(app).get('/bookings');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should filter bookings by status', async () => {
      const response = await request(app).get('/bookings?status=pending');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter bookings by search term', async () => {
      const response = await request(app).get('/bookings?search=TEST-ROUTE');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].customer_phone).toBe('TEST-ROUTE');
    });
  });

  describe('GET /bookings/:id', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-ROUTE',
        bookingDate: '2024-01-01',
        products: [
          {
            productId: testProductId,
            bookedFrom: '2024-02-01',
            bookedTo: '2024-02-05',
            rent: 50000,
            securityDeposit: 20000
          }
        ],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      testBookingId = result.booking_id;
    });

    it('should return booking by id with payment summary', async () => {
      const response = await request(app).get(`/bookings/${testBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testBookingId);
      expect(response.body).toHaveProperty('payment_summary');
      expect(response.body.payment_summary.totals).toHaveProperty('total_due');
      expect(response.body.payment_summary.totals).toHaveProperty('total_paid');
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app).get('/bookings/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /bookings/:id/confirm', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-ROUTE',
        bookingDate: '2024-01-01',
        products: [
          {
            productId: testProductId,
            bookedFrom: '2024-02-01',
            bookedTo: '2024-02-05',
            rent: 50000,
            securityDeposit: 20000
          }
        ],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      testBookingId = result.booking_id;
    });

    it('should confirm a pending booking', async () => {
      const response = await request(app)
        .put(`/bookings/${testBookingId}/confirm`)
        .send({
          confirmed_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('booking_id', testBookingId);
      expect(response.body).toHaveProperty('status', 'confirmed');
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app)
        .put('/bookings/999999/confirm')
        .send({
          confirmed_by: 'test-user'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /bookings/:id/status', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-ROUTE',
        bookingDate: '2024-01-01',
        products: [
          {
            productId: testProductId,
            bookedFrom: '2024-02-01',
            bookedTo: '2024-02-05',
            rent: 50000,
            securityDeposit: 20000
          }
        ],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      testBookingId = result.booking_id;
    });

    it('should update booking status', async () => {
      const response = await request(app).put(`/bookings/${testBookingId}/status`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('booking_id', testBookingId);
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('DELETE /bookings/:id', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-ROUTE',
        bookingDate: '2024-01-01',
        products: [
          {
            productId: testProductId,
            bookedFrom: '2024-02-01',
            bookedTo: '2024-02-05',
            rent: 50000,
            securityDeposit: 20000
          }
        ],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      testBookingId = result.booking_id;
    });

    it('should delete a booking', async () => {
      const response = await request(app).delete(`/bookings/${testBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');

      // Verify booking is deleted
      const checkResponse = await request(app).get(`/bookings/${testBookingId}`);
      expect(checkResponse.status).toBe(404);
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app).delete('/bookings/999999');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /bookings/:id/final-discount', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-BOOKING-ROUTE',
        bookingDate: '2024-01-01',
        products: [
          {
            productId: testProductId,
            bookedFrom: '2024-02-01',
            bookedTo: '2024-02-05',
            rent: 50000,
            securityDeposit: 20000
          }
        ],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      testBookingId = result.booking_id;

      await bookingService.confirmBooking(testBookingId, 'test-user');
    });

    it('should apply final settlement discount', async () => {
      const response = await request(app)
        .post(`/bookings/${testBookingId}/final-discount`)
        .send({
          discount_amount: 5000,
          reason: 'Goodwill discount',
          applied_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.discount_details).toHaveProperty('booking_id', testBookingId);
      expect(response.body.discount_details).toHaveProperty('discount_amount', 5000);
      
      // Verify discount is reflected in booking
      const booking = await pool.query('SELECT final_discount FROM bookings WHERE id = $1', [testBookingId]);
      expect(booking.rows[0].final_discount).toBe(5000);
    });

    it('should return 400 if discount already applied', async () => {
      // Apply discount first time
      await request(app)
        .post(`/bookings/${testBookingId}/final-discount`)
        .send({
          discount_amount: 5000,
          applied_by: 'test-user'
        });

      // Try to apply again
      const response = await request(app)
        .post(`/bookings/${testBookingId}/final-discount`)
        .send({
          discount_amount: 3000,
          applied_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already has');
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post(`/bookings/${testBookingId}/final-discount`)
        .send({
          // Missing discount_amount
          applied_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app)
        .post('/bookings/999999/final-discount')
        .send({
          discount_amount: 5000,
          applied_by: 'test-user'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /bookings/:id/finalize', () => {
    let finalizeTestBookingId;
    let finalizeTestProductId;

    beforeEach(async () => {
      // Create a booking for finalization tests
      const booking = await bookingService.createBooking({
        customerName: 'Finalize Test Customer',
        customerPhone: 'TEST-ROUTE',
        customerEmail: 'finalize@test.com',
        bookingDate: new Date().toISOString().split('T')[0],
        products: [{
          productId: testProductId,
          bookedFrom: new Date().toISOString().split('T')[0],
          bookedTo: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          rent: 50000,
          securityDeposit: 20000
        }],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      finalizeTestBookingId = booking.booking_id;

      // Confirm booking
      await bookingService.confirmBooking(finalizeTestBookingId, 'test-user');

      // Get booking product ID
      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [finalizeTestBookingId]
      );
      finalizeTestProductId = bpResult.rows[0].id;

      // Complete all products
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE booking_id = $2',
        ['completed', finalizeTestBookingId]
      );
    });

    // Test: Finalize with balance due (customer owes money)
    it('should finalize booking with balance due (collect scenario)', async () => {
      // Pay partial amount (only rent 50000, leaving transport 5000 + security 20000)
      await chargeAccountingService.applyPayment(
        finalizeTestBookingId,
        50000,
        'Cash',
        'test-user',
        'Partial payment'
      );

      const response = await request(app)
        .post(`/bookings/${finalizeTestBookingId}/finalize`)
        .send({
          final_discount: 5000,
          finalized_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.settlement.action).toBe('collect');
      expect(response.body.settlement.final_discount).toBe(5000);
      // Balance = (50000 + 5000 + 20000) - 50000 - 5000 = 20000 to collect
      expect(response.body.settlement.amount).toBe(20000);

      // Verify booking status updated to completed
      const bookingCheck = await pool.query(
        'SELECT status, final_discount FROM bookings WHERE id = $1',
        [finalizeTestBookingId]
      );
      expect(bookingCheck.rows[0].status).toBe('completed');
      expect(bookingCheck.rows[0].final_discount).toBe(5000);
    });

    // Test: Finalize with overpayment (refund scenario)
    it('should finalize booking with overpayment (refund scenario)', async () => {
      // Pay more than total due
      await chargeAccountingService.applyPayment(
        finalizeTestBookingId,
        80000, // Total due is 75000, so 5000 overpayment
        'Cash',
        'test-user',
        'Overpayment'
      );

      const response = await request(app)
        .post(`/bookings/${finalizeTestBookingId}/finalize`)
        .send({
          final_discount: 3000,
          finalized_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.settlement.action).toBe('refund');
      expect(response.body.settlement.final_discount).toBe(3000);
      // Refund = overpayment + discount = 5000 + 3000 = 8000
      expect(response.body.settlement.amount).toBe(8000);
    });

    // Test: Finalize with perfect balance (none scenario)
    it('should finalize booking with perfect balance', async () => {
      // Pay exact amount
      await chargeAccountingService.applyPayment(
        finalizeTestBookingId,
        75000, // Exact total: 50000 rent + 5000 transport + 20000 security
        'Cash',
        'test-user',
        'Full payment'
      );

      const response = await request(app)
        .post(`/bookings/${finalizeTestBookingId}/finalize`)
        .send({
          final_discount: 0,
          finalized_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.settlement.action).toBe('none');
      expect(response.body.settlement.amount).toBe(0);
    });

    // Test: Finalize with discount turning balance to refund
    it('should finalize with discount converting balance due to refund', async () => {
      // Pay exact amount
      await chargeAccountingService.applyPayment(
        finalizeTestBookingId,
        75000,
        'Cash',
        'test-user',
        'Full payment'
      );

      // Apply discount larger than 0 balance
      const response = await request(app)
        .post(`/bookings/${finalizeTestBookingId}/finalize`)
        .send({
          final_discount: 5000,
          finalized_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.settlement.action).toBe('refund');
      expect(response.body.settlement.amount).toBe(5000);
    });

    // Test: Cannot finalize if products still active
    it('should return 400 if products not all completed/cancelled', async () => {
      // Set product back to in_progress
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE booking_id = $2',
        ['in_progress', finalizeTestBookingId]
      );

      const response = await request(app)
        .post(`/bookings/${finalizeTestBookingId}/finalize`)
        .send({
          final_discount: 0,
          finalized_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('still active');
    });

    // Test: Returns 400 if negative discount
    it('should return 400 if final_discount is negative', async () => {
      const response = await request(app)
        .post(`/bookings/${finalizeTestBookingId}/finalize`)
        .send({
          final_discount: -1000,
          finalized_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('must be >= 0');
    });

    // Test: Returns 404 if booking not found
    it('should return 404 if booking does not exist', async () => {
      const response = await request(app)
        .post('/bookings/999999/finalize')
        .send({
          final_discount: 0,
          finalized_by: 'test-user'
        });

      expect(response.status).toBe(404);
    });
  });

  // Test suite: GET /bookings/:id/activity-log
  describe('GET /bookings/:id/activity-log', () => {
    let activityLogTestBookingId;
    let activityLogProductId;

    beforeEach(async () => {
      // Create a booking using the service (which properly initializes charges)
      const booking = await bookingService.createBooking({
        customerName: 'Activity Log Test',
        customerPhone: '1234567890',
        customerEmail: 'activitylog@test.com',
        bookingDate: new Date().toISOString().split('T')[0],
        products: [{
          productId: testProductId,
          bookedFrom: '2024-05-01',
          bookedTo: '2024-05-05',
          rent: 10000,
          securityDeposit: 5000
        }],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      activityLogTestBookingId = booking.booking_id;

      // Get booking_product_id
      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [activityLogTestBookingId]
      );
      activityLogProductId = bpResult.rows[0].id;

      // Confirm the booking
      await bookingService.confirmBooking(activityLogTestBookingId, 'test-user');

      // Create some activity log entries
      await pool.query(
        `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
         VALUES 
         ($1, 'payment_applied', $2, 'test-user'),
         ($1, 'product_picked_up', $3, 'test-user')`,
        [
          activityLogTestBookingId,
          JSON.stringify({ amount: 5000, method: 'Cash' }),
          JSON.stringify({ booking_product_id: activityLogProductId })
        ]
      );
    });

    // Test: Retrieve activity log successfully
    it('should return activity log for a booking', async () => {
      const response = await request(app)
        .get(`/bookings/${activityLogTestBookingId}/activity-log`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.booking_id).toBe(activityLogTestBookingId);
      expect(response.body.activities).toBeInstanceOf(Array);
      expect(response.body.activities.length).toBeGreaterThanOrEqual(2); // At least 2 entries created in beforeEach
      expect(response.body.count).toBeGreaterThanOrEqual(2);

      // Check first activity entry structure
      const firstActivity = response.body.activities[0];
      expect(firstActivity).toHaveProperty('id');
      expect(firstActivity).toHaveProperty('booking_id');
      expect(firstActivity).toHaveProperty('event_type');
      expect(firstActivity).toHaveProperty('details');
      expect(firstActivity).toHaveProperty('performed_by');
      expect(firstActivity).toHaveProperty('created_at');

      // Verify at least one of our manual entries exists
      const eventTypes = response.body.activities.map(a => a.event_type);
      expect(eventTypes).toContain('payment_applied');
      expect(eventTypes).toContain('product_picked_up');
    });

    // Test: Returns 404 for non-existent booking
    it('should return 404 for non-existent booking', async () => {
      const response = await request(app)
        .get('/bookings/999999/activity-log');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Booking not found');
    });

    // Test: Returns empty array for booking with no activities
    it('should return empty array for booking with no activity log', async () => {
      // Create a booking without any activity log entries
      const emptyBookingResult = await pool.query(
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, status, created_by)
         VALUES ('Empty Activity Test', '9876543210', CURRENT_DATE, 'pending', 'test-user')
         RETURNING id`
      );
      const emptyBookingId = emptyBookingResult.rows[0].id;

      const response = await request(app)
        .get(`/bookings/${emptyBookingId}/activity-log`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.activities).toBeInstanceOf(Array);
      expect(response.body.activities.length).toBe(0);
      expect(response.body.count).toBe(0);
    });
  });
});
