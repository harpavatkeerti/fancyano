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
      `INSERT INTO products (code, name, rent, security_deposit, category)
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
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN ('TEST-CANCEL-ROUTE', 'CANCEL-PREVIEW-TEST'))`);
    await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN ('TEST-CANCEL-ROUTE', 'CANCEL-PREVIEW-TEST'))`);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN ('TEST-CANCEL-ROUTE', 'CANCEL-PREVIEW-TEST')))`);
    await pool.query(`DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN ('TEST-CANCEL-ROUTE', 'CANCEL-PREVIEW-TEST'))`);
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN ('TEST-CANCEL-ROUTE', 'CANCEL-PREVIEW-TEST'))`);
    await pool.query(`DELETE FROM bookings WHERE customer_phone IN ('TEST-CANCEL-ROUTE', 'CANCEL-PREVIEW-TEST')`);
    await pool.query(`DELETE FROM products WHERE code IN ('TEST-CANCEL-001', 'TEST-CANCEL-PREV-002')`);
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
        `INSERT INTO products (code, name, rent, security_deposit, category)
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

  describe('GET /cancellation/preview/:bookingId', () => {
    let previewBookingId;
    let previewBPId;

    beforeEach(async () => {
      const booking = await bookingService.createBooking({
        customerName: 'Cancel Preview Customer',
        customerPhone: 'CANCEL-PREVIEW-TEST',
        customerEmail: 'cancel-preview@test.com',
        bookingDate: new Date().toISOString().split('T')[0],
        products: [{
          productId: testProductId,
          bookedFrom: new Date().toISOString().split('T')[0],
          bookedTo: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          rent: 50000,
          securityDeposit: 20000
        }],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      previewBookingId = booking.booking_id;

      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [previewBookingId]
      );
      previewBPId = bpResult.rows[0].id;

      await bookingService.confirmBooking(previewBookingId, 'test-user');
    });

    afterEach(async () => {
      await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [previewBookingId]);
      await pool.query('DELETE FROM booking_cancellation_history WHERE booking_id = $1', [previewBookingId]);
      await pool.query('DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)', [previewBookingId]);
      await pool.query('DELETE FROM payment_transactions WHERE booking_id = $1', [previewBookingId]);
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [previewBookingId]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [previewBookingId]);
    });

    it('should return complete cancellation preview with all required fields', async () => {
      const response = await request(app).get(`/cancellation/preview/${previewBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('booking_id', previewBookingId);
      expect(response.body).toHaveProperty('booking_date');
      expect(response.body).toHaveProperty('days_from_booking');
      expect(response.body).toHaveProperty('penalty_percentage');
      expect(response.body).toHaveProperty('all_products');
      expect(response.body).toHaveProperty('products_to_cancel');
      expect(response.body).toHaveProperty('total_penalty_amount');
      expect(response.body).toHaveProperty('base_refund');
      expect(response.body).toHaveProperty('total_paid');
      expect(response.body).toHaveProperty('total_refunded');
      expect(response.body).toHaveProperty('net_paid');
      expect(response.body).toHaveProperty('paid_rent');
      expect(response.body).toHaveProperty('paid_security_deposit');
      expect(response.body).toHaveProperty('payment_action');
      expect(response.body).toHaveProperty('payment_difference');

      // Verify product data
      expect(response.body.all_products).toHaveLength(1);
      expect(response.body.all_products[0]).toHaveProperty('product_id', previewBPId);
      expect(response.body.all_products[0]).toHaveProperty('name');
      expect(response.body.all_products[0]).toHaveProperty('code');
      expect(response.body.all_products[0]).toHaveProperty('rent', 50000);
      expect(response.body.all_products[0]).toHaveProperty('security_deposit', 20000);

      // Verify products_to_cancel has penalty info
      expect(response.body.products_to_cancel).toHaveLength(1);
      expect(response.body.products_to_cancel[0]).toHaveProperty('penalty_percentage');
      expect(response.body.products_to_cancel[0]).toHaveProperty('penalty_amount');
      expect(typeof response.body.products_to_cancel[0].penalty_amount).toBe('number');
    });

    it('should exclude already cancelled products from preview', async () => {
      // Cancel the product first
      await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [previewBPId],
          cancelled_by: 'test-user'
        });

      const response = await request(app).get(`/cancellation/preview/${previewBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body.all_products).toHaveLength(0);
      expect(response.body.products_to_cancel).toHaveLength(0);
    });

    it('should return preview with multiple cancellable products', async () => {
      // Add a second product to the booking
      const product2Result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-CANCEL-PREV-002', 'Test Preview Product 2', 30000, 15000, 'test']
      );
      const product2Id = product2Result.rows[0].id;

      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [previewBookingId, product2Id, '2024-02-01', '2024-02-05', 'confirmed', 30000, 15000, 30000]
      );
      const bp2Id = bp2Result.rows[0].id;

      const response = await request(app).get(`/cancellation/preview/${previewBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body.all_products).toHaveLength(2);
      expect(response.body.products_to_cancel).toHaveLength(2);

      // Total cancelled rent required should be sum of both products
      expect(response.body.total_cancelled_rent_required).toBe(80000); // 50000 + 30000

      // Cleanup
      await pool.query('DELETE FROM product_charges WHERE booking_product_id = $1', [bp2Id]);
      await pool.query('DELETE FROM booking_products WHERE id = $1', [bp2Id]);
      await pool.query('DELETE FROM products WHERE id = $1', [product2Id]);
    });

    it('should include payment data when payments exist', async () => {
      // Record a payment
      const chargeAccountingService = require('../services/chargeAccountingService');
      await chargeAccountingService.applyPayment(previewBookingId, 30000, 'Cash', 'test-user', 'Test payment');

      const response = await request(app).get(`/cancellation/preview/${previewBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body.total_paid).toBe(30000);
      expect(response.body.net_paid).toBe(30000);
      expect(response.body.paid_rent).toBeGreaterThan(0); // Payment applied to rent first
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app).get('/cancellation/preview/999999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Booking not found');
    });
  });

  describe('GET /cancellation/info/:booking_product_id', () => {
    let infoTestBookingId;
    let infoTestBPId;

    beforeEach(async () => {
      // Create test booking
      const booking = await bookingService.createBooking({
        customerName: 'Cancellation Info Customer',
        customerPhone: 'CANCEL-INFO-TEST',
        customerEmail: 'cancel-info@test.com',
        bookingDate: new Date().toISOString().split('T')[0],
        products: [{
          productId: testProductId,
          bookedFrom: new Date().toISOString().split('T')[0],
          bookedTo: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          rent: 50000,
          securityDeposit: 20000
        }],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      infoTestBookingId = booking.booking_id;

      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [infoTestBookingId]
      );
      infoTestBPId = bpResult.rows[0].id;

      // Confirm booking
      await bookingService.confirmBooking(infoTestBookingId, 'test-user');
    });

    afterEach(async () => {
      await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [infoTestBookingId]);
      await pool.query('DELETE FROM product_charges WHERE booking_product_id = $1', [infoTestBPId]);
      await pool.query('DELETE FROM booking_products WHERE id = $1', [infoTestBPId]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [infoTestBookingId]);
    });

    it('should return cancellation info with max penalty for confirmed product', async () => {
      const response = await request(app).get(`/cancellation/info/${infoTestBPId}`);

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(true);
      expect(response.body.reason).toBe('Product is eligible for cancellation');
      expect(response.body.product).toBeDefined();
      expect(response.body.max_penalty).toBeGreaterThanOrEqual(0);
      expect(response.body.policy).toBeDefined();
    });

    it('should return eligible=false for cancelled product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['cancelled', infoTestBPId]);

      const response = await request(app).get(`/cancellation/info/${infoTestBPId}`);

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(false);
      expect(response.body.reason).toContain('Cannot cancel product with status: cancelled');
    });

    it('should return eligible=false for completed product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', infoTestBPId]);

      const response = await request(app).get(`/cancellation/info/${infoTestBPId}`);

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(false);
      expect(response.body.reason).toContain('Cannot cancel product with status: completed');
    });

    it('should return eligible=false for in_progress product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['in_progress', infoTestBPId]);

      const response = await request(app).get(`/cancellation/info/${infoTestBPId}`);

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(false);
      expect(response.body.reason).toContain('Cannot cancel product with status: in_progress');
    });

    it('should return eligible=false for non-existent product', async () => {
      const response = await request(app).get('/cancellation/info/999999');

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(false);
      expect(response.body.reason).toBe('Booking product not found');
    });
  });
});
