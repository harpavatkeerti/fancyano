const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const bookingService = require('../services/bookingService');
const policyService = require('../services/policyService');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/cancellation', require('./bookingCancellation'));

describe('Booking Cancellation Routes', () => {
  let testBookingId;
  let testBookingProductId;
  let testProductId;
  let testPolicyId;

  beforeAll(async () => {
    // Clean up ALL existing test policies that might conflict from other test suites
    await pool.query(`DELETE FROM rental_policies WHERE policy_key LIKE 'test_%'`);
    
    // Create test product
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent_per_day, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['TEST-CANCEL-001', 'Test Cancel Product', 50000, 20000, 'test']
    );
    testProductId = productResult.rows[0].id;

    // Create test policies for different time ranges
    await policyService.upsertPolicy({
      policy_key: 'test_cancellation_0_1',
      policy_name: 'Cancellation 0-1 days',
      policy_type: 'cancellation_penalty',
      value_type: 'percentage',
      value: 0,
      days_from_booking_min: 0,
      days_from_booking_max: 1,
      created_by: 'test-user'
    });
    
    await policyService.upsertPolicy({
      policy_key: 'test_cancellation_2_3',
      policy_name: 'Cancellation 2-3 days',
      policy_type: 'cancellation_penalty',
      value_type: 'percentage',
      value: 25,
      days_from_booking_min: 2,
      days_from_booking_max: 3,
      created_by: 'test-user'
    });
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE')`);
    await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE')`);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE'))`);
    await pool.query(`DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE')`);
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE')`);
    await pool.query(`DELETE FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE'`);
    await pool.query(`DELETE FROM products WHERE code = 'TEST-CANCEL-001'`);
    await pool.query(`DELETE FROM rental_policies WHERE policy_key IN ('test_cancellation_0_1', 'test_cancellation_2_3')`);
  });

  afterEach(async () => {
    // Cleanup after each test
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE')`);
    await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE')`);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE'))`);
    await pool.query(`DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE')`);
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE')`);
    await pool.query(`DELETE FROM bookings WHERE customer_phone = 'TEST-CANCEL-ROUTE'`);
  });

  describe('POST /cancellation', () => {
    beforeEach(async () => {
      // Create a test booking with confirmed status
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-CANCEL-ROUTE',
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

      // Confirm the booking
      await bookingService.confirmBooking(testBookingId, 'test-user');

      // Get booking_product_id
      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [testBookingId]
      );
      testBookingProductId = bpResult.rows[0].id;
    });

    it('should cancel a product with penalty', async () => {
      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId],
          cancellation_penalties: [
            { booking_product_id: testBookingProductId, penalty_amount: 25000 }
          ],
          cancellation_reason: 'Customer changed mind',
          cancelled_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.cancelled_products).toHaveLength(1);
      expect(response.body.cancelled_products[0]).toHaveProperty('booking_product_id', testBookingProductId);
      expect(response.body.cancelled_products[0]).toHaveProperty('status', 'cancelled');
    });

    it('should cancel multiple products', async () => {
      // Add another product
      const product2Result = await pool.query(
        `INSERT INTO products (code, name, rent_per_day, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-CANCEL-002', 'Test Cancel Product 2', 30000, 15000, 'test']
      );
      const product2Id = product2Result.rows[0].id;

      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [testBookingId, product2Id, '2024-02-01', '2024-02-05', 'confirmed']
      );
      const bp2Id = bp2Result.rows[0].id;

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId, bp2Id],
          cancellation_penalties: [
            { booking_product_id: testBookingProductId, penalty_amount: 25000 },
            { booking_product_id: bp2Id, penalty_amount: 15000 }
          ],
          cancellation_reason: 'Multiple cancellations',
          cancelled_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.cancelled_products).toHaveLength(2);

      // Cleanup - must delete in correct order due to foreign keys
      await pool.query(`DELETE FROM product_charges WHERE booking_product_id = $1`, [bp2Id]);
      await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_product_id = $1`, [bp2Id]);
      await pool.query(`DELETE FROM booking_products WHERE id = $1`, [bp2Id]);
      await pool.query(`DELETE FROM products WHERE id = $1`, [product2Id]);
    });

    it('should return 400 if booking_product_ids is missing', async () => {
      const response = await request(app)
        .post('/cancellation')
        .send({
          cancellation_reason: 'Test',
          cancelled_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if trying to cancel already cancelled product', async () => {
      // Cancel the product first
      await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId],
          cancelled_by: 'test-user'
        });

      // Try to cancel again
      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId],
          cancelled_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot cancel');
    });
  });

  describe('GET /cancellation/penalty-suggestion/:booking_product_id', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-CANCEL-ROUTE',
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

      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [testBookingId]
      );
      testBookingProductId = bpResult.rows[0].id;
    });

    it('should return penalty suggestion for a booking product', async () => {
      const response = await request(app).get(`/cancellation/penalty-suggestion/${testBookingProductId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('amount');
      expect(response.body).toHaveProperty('policy');
      expect(typeof response.body.amount).toBe('number');
    });

    it('should return 404 for non-existent booking product', async () => {
      const response = await request(app).get('/cancellation/penalty-suggestion/999999');

      expect(response.status).toBe(404);
    });
  });
});
