const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const bookingService = require('../services/bookingService');
const policyService = require('../services/policyService');

// Create express app for testing
const app = express();
app.use(express.json());
// Mock auth: tests run as admin so checkSalesmanPermission always passes
app.use((req, res, next) => { req.user = { role: 'admin', id: 'test-user' }; next(); });
app.use('/cancellation', require('./bookingCancellation'));

describe('Booking Cancellation Routes', () => {
  let testBookingId;
  let testBookingProductId;
  let testProductId;
  let testPolicyId;

  beforeAll(async () => {
    // Deactivate real policies to avoid overlap conflicts with test policies
    await pool.query(`UPDATE rental_policies SET is_active = false WHERE policy_key NOT LIKE 'test_%'`);
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
    if (testBookingId) {
      await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [testBookingId]);
      await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM bookings WHERE id = $1`, [testBookingId]);
    }
    await pool.query(`DELETE FROM products WHERE code IN ('TEST-CANCEL-001', 'TEST-CANCEL-PREV-002')`);
    await pool.query(`DELETE FROM rental_policies WHERE policy_key IN ('test_cancellation_0_1', 'test_cancellation_2_3')`);
    // Re-activate real policies
    await pool.query(`UPDATE rental_policies SET is_active = true WHERE policy_key NOT LIKE 'test_%'`);
  });

  describe('POST /cancellation', () => {
    beforeEach(async () => {
      // Create a test booking with confirmed status
      const result = await bookingService.createBooking({
        userId: 1,
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

    afterEach(async () => {
      if (testBookingId) {
        await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [testBookingId]);
        await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id = $1`, [testBookingId]);
        await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [testBookingId]);
        await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [testBookingId]);
        await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [testBookingId]);
        await pool.query(`DELETE FROM bookings WHERE id = $1`, [testBookingId]);
        testBookingId = null;
      }
    });

    it('should cancel a product with penalty', async () => {
      const chargeAccountingService = require('../services/chargeAccountingService');
      // Pay enough to cover the penalty so diffAmount >= 0
      await chargeAccountingService.applyPayment(testBookingId, 25000, 'Cash', 'test-user', 'Payment');

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
          // No penalty overrides — policy defaults to 0% for same-day cancellation
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

    it('should return 400 if security deposit has been partially paid', async () => {
      const chargeAccountingService = require('../services/chargeAccountingService');
      // Pay enough to cover rent + some security
      await chargeAccountingService.applyPayment(testBookingId, 75000, 'Cash', 'test-user', 'Payment');

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId],
          cancelled_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot cancel product: security deposit has been');
    });

    it('should cancel with settlement_action=refund and record refund transaction', async () => {
      // First pay some amount so there's something to refund
      const chargeAccountingService = require('../services/chargeAccountingService');
      await chargeAccountingService.applyPayment(testBookingId, 50000, 'Cash', 'test-user', 'Payment');

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId],
          cancellation_penalties: [
            { booking_product_id: testBookingProductId, penalty_amount: 5000 }
          ],
          cancellation_reason: 'Customer changed mind',
          cancelled_by: 'test-user',
          settlement_action: 'refund',
          payment_method: 'UPI',
          settlement_notes: 'Refund via UPI'
        });

      expect(response.status).toBe(200);
      expect(response.body.total_diff_amount).toBeGreaterThan(0);
      expect(response.body.settlement).not.toBeNull();
      expect(response.body.settlement.settlement_action).toBe('refund');
      expect(response.body.settlement.transaction_recorded).toBe(true);
      expect(response.body.settlement.method).toBe('UPI');
    });

    it('should cancel with settlement_action=adjust and adjust against dues', async () => {
      // Pay enough for the product charges
      const chargeAccountingService = require('../services/chargeAccountingService');
      await chargeAccountingService.applyPayment(testBookingId, 50000, 'Cash', 'test-user', 'Payment');

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId],
          cancellation_penalties: [
            { booking_product_id: testBookingProductId, penalty_amount: 5000 }
          ],
          cancellation_reason: 'Customer changed mind',
          cancelled_by: 'test-user',
          settlement_action: 'adjust'
        });

      expect(response.status).toBe(200);
      expect(response.body.total_diff_amount).toBeGreaterThan(0);
      expect(response.body.settlement).not.toBeNull();
      expect(response.body.settlement.settlement_action).toBe('adjust');
      expect(response.body.settlement.transaction_recorded).toBe(true);
    });

    it('should cancel with settlement_action=none and not record settlement', async () => {
      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId],
          cancellation_reason: 'Customer changed mind',
          cancelled_by: 'test-user',
          settlement_action: 'none'
        });

      expect(response.status).toBe(200);
      expect(response.body.settlement).toBeNull(); // No refund to settle (nothing paid)
    });

    it('should cancel without settlement_action and not record settlement', async () => {
      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [testBookingProductId],
          cancellation_reason: 'Customer changed mind',
          cancelled_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.settlement).toBeNull();
    });
  });

  describe('GET /cancellation/penalty-suggestion/:booking_product_id', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        userId: 1,
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

    afterEach(async () => {
      if (testBookingId) {
        await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [testBookingId]);
        await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id = $1`, [testBookingId]);
        await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [testBookingId]);
        await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [testBookingId]);
        await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [testBookingId]);
        await pool.query(`DELETE FROM bookings WHERE id = $1`, [testBookingId]);
        testBookingId = null;
      }
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
        userId: 1,
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
      expect(response.body).toHaveProperty('total_cancelled_rent');
      expect(response.body).toHaveProperty('total_cancelled_security');
      expect(response.body).toHaveProperty('total_rent_paid');
      expect(response.body).toHaveProperty('total_security_paid');
      expect(response.body).toHaveProperty('total_refund_amount');
      expect(response.body).toHaveProperty('payment_action');
      expect(response.body).toHaveProperty('payment_difference');

      // Verify product data includes per-product paid amounts
      expect(response.body.all_products).toHaveLength(1);
      expect(response.body.all_products[0]).toHaveProperty('product_id', previewBPId);
      expect(response.body.all_products[0]).toHaveProperty('name');
      expect(response.body.all_products[0]).toHaveProperty('code');
      expect(response.body.all_products[0]).toHaveProperty('rent', 50000);
      expect(response.body.all_products[0]).toHaveProperty('security_deposit', 20000);
      expect(response.body.all_products[0]).toHaveProperty('rent_paid');
      expect(response.body.all_products[0]).toHaveProperty('security_paid');

      // Verify products_to_cancel has penalty + refund info
      expect(response.body.products_to_cancel).toHaveLength(1);
      expect(response.body.products_to_cancel[0]).toHaveProperty('penalty_percentage');
      expect(response.body.products_to_cancel[0]).toHaveProperty('penalty_amount');
      expect(response.body.products_to_cancel[0]).toHaveProperty('refund_amount');
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

      // Total cancelled rent should be sum of both products
      expect(response.body.total_cancelled_rent).toBe(80000); // 50000 + 30000

      // Cleanup
      await pool.query('DELETE FROM product_charges WHERE booking_product_id = $1', [bp2Id]);
      await pool.query('DELETE FROM booking_products WHERE id = $1', [bp2Id]);
      await pool.query('DELETE FROM products WHERE id = $1', [product2Id]);
    });

    it('should include per-product payment data when payments exist', async () => {
      // Record a payment
      const chargeAccountingService = require('../services/chargeAccountingService');
      await chargeAccountingService.applyPayment(previewBookingId, 30000, 'Cash', 'test-user', 'Test payment');

      const response = await request(app).get(`/cancellation/preview/${previewBookingId}`);

      expect(response.status).toBe(200);
      // Per-product paid amounts should reflect the payment
      expect(response.body.total_rent_paid).toBeGreaterThan(0); // Payment applied to rent first
      expect(response.body.all_products[0].rent_paid).toBeGreaterThan(0);
      // Total refund should reflect paid amounts minus penalty
      expect(typeof response.body.total_refund_amount).toBe('number');
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
        userId: 1,
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

  describe('POST /cancellation/calculate-summary', () => {
    let summaryBookingId;
    let summaryBPId;

    beforeEach(async () => {
      const booking = await bookingService.createBooking({
        userId: 1,
        customerEmail: 'summary@test.com',
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
      summaryBookingId = booking.booking_id;

      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [summaryBookingId]
      );
      summaryBPId = bpResult.rows[0].id;

      // Confirm the booking
      await bookingService.confirmBooking(summaryBookingId, 'test-user');
    });

    afterEach(async () => {
      await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [summaryBookingId]);
      await pool.query('DELETE FROM booking_cancellation_history WHERE booking_id = $1', [summaryBookingId]);
      await pool.query('DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)', [summaryBookingId]);
      await pool.query('DELETE FROM payment_transactions WHERE booking_id = $1', [summaryBookingId]);
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [summaryBookingId]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [summaryBookingId]);
    });

    it('should return cancellation summary for selected products', async () => {
      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('selected_count', 1);
      expect(response.body).toHaveProperty('total_count', 1);
      expect(response.body).toHaveProperty('selected_rent', 50000);
      expect(response.body).toHaveProperty('selected_security', 20000);
      expect(response.body).toHaveProperty('selected_rent_paid', 0);
      expect(response.body).toHaveProperty('selected_security_paid', 0);
      expect(response.body).toHaveProperty('total_penalty');
      expect(response.body).toHaveProperty('calculated_refund'); // no payments, calculated_refund <= 0
      expect(response.body).toHaveProperty('total_paid_for_selected', 0);
    });

    it('should use auto-calculated penalties (penalty_overrides ignored)', async () => {
      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId]
        });

      expect(response.status).toBe(200);
      // Penalty is auto-calculated — not overridable
      expect(typeof response.body.total_penalty).toBe('number');
      // calculated_refund = total_paid - penalty - discount_reverted
      expect(typeof response.body.calculated_refund).toBe('number');
      expect(response.body).not.toHaveProperty('payment_action');
      expect(response.body).not.toHaveProperty('refund_amount');
    });

    it('should return calculated_refund after payment', async () => {
      // First apply a payment so there's something to refund
      const chargeAccountingService = require('../services/chargeAccountingService');
      await chargeAccountingService.applyPayment(summaryBookingId, 50000, 'Cash', 'test-user', 'Full rent payment');

      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId]
        });

      expect(response.status).toBe(200);
      expect(response.body.selected_rent_paid).toBe(50000);
      expect(response.body.total_paid_for_selected).toBe(50000);
      // calculated_refund = 50000 - penalty - discount
      expect(typeof response.body.calculated_refund).toBe('number');
      expect(response.body).not.toHaveProperty('extra_refund');
    });

    it('should return zero totals for empty selection', async () => {
      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: []
        });

      expect(response.status).toBe(200);
      expect(response.body.selected_count).toBe(0);
      expect(response.body.selected_rent).toBe(0);
      expect(response.body.calculated_refund).toBe(0);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: 999999,
          selected_product_ids: [1]
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Booking not found');
    });

    // Case 1: Single-product booking selected → remaining_dues_on_other_products = 0
    it('Case 1: single-product booking returns remaining_dues_on_other_products = 0', async () => {
      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('remaining_dues_on_other_products', 0);
    });

    // Case 2: Two-product booking, one selected, other has ₹3,000 unpaid rent → field = 3000
    it('Case 2: two-product booking, other product has ₹3,000 dues → remaining_dues_on_other_products = 3000', async () => {
      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 3000, 0)
         RETURNING id`,
        [summaryBookingId, testProductId]
      );
      const bp2Id = bp2Result.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 3000, 0)`,
        [bp2Id]
      );

      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('remaining_dues_on_other_products', 3000);
    });

    // Case 3: Two-product booking, both selected → remaining_dues_on_other_products = 0
    it('Case 3: two-product booking, both selected → remaining_dues_on_other_products = 0', async () => {
      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 3000, 0)
         RETURNING id`,
        [summaryBookingId, testProductId]
      );
      const bp2Id = bp2Result.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 3000, 0)`,
        [bp2Id]
      );

      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId, bp2Id]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('remaining_dues_on_other_products', 0);
    });

    // Case 4: Two-product booking, one selected, other already 'cancelled' → field = 0
    it('Case 4: two-product booking, other product is cancelled → remaining_dues_on_other_products = 0', async () => {
      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + 5, 'cancelled', 3000, 0)
         RETURNING id`,
        [summaryBookingId, testProductId]
      );
      const bp2Id = bp2Result.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 3000, 0)`,
        [bp2Id]
      );

      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('remaining_dues_on_other_products', 0);
    });

    // Case 5: Two-product booking, one selected, other is 'exchanged' → field = 0
    it('Case 5: two-product booking, other product is exchanged → remaining_dues_on_other_products = 0', async () => {
      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + 5, 'exchanged', 3000, 0)
         RETURNING id`,
        [summaryBookingId, testProductId]
      );
      const bp2Id = bp2Result.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 3000, 0)`,
        [bp2Id]
      );

      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('remaining_dues_on_other_products', 0);
    });

    // Case 6: Two-product booking, one selected, other is fully paid → field = 0
    it('Case 6: two-product booking, other product fully paid → remaining_dues_on_other_products = 0', async () => {
      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 3000, 0)
         RETURNING id`,
        [summaryBookingId, testProductId]
      );
      const bp2Id = bp2Result.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 3000, 3000)`,
        [bp2Id]
      );

      const response = await request(app)
        .post('/cancellation/calculate-summary')
        .send({
          booking_id: summaryBookingId,
          selected_product_ids: [summaryBPId]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('remaining_dues_on_other_products', 0);
    });
  });

  describe('processCancellationSettlement — balance excludes cancelling product (Cases 7–13)', () => {
    let settleBookingId;
    let settleBPId;

    beforeEach(async () => {
      const booking = await bookingService.createBooking({
        userId: 1,
        customerEmail: 'settle@test.com',
        bookingDate: new Date().toISOString().split('T')[0],
        products: [{
          productId: testProductId,
          bookedFrom: new Date().toISOString().split('T')[0],
          bookedTo: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          rent: 9200,
          securityDeposit: 9000
        }],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      settleBookingId = booking.booking_id;

      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [settleBookingId]
      );
      settleBPId = bpResult.rows[0].id;

      await bookingService.confirmBooking(settleBookingId, 'test-user');
    });

    afterEach(async () => {
      await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [settleBookingId]);
      await pool.query('DELETE FROM booking_cancellation_history WHERE booking_id = $1', [settleBookingId]);
      await pool.query('DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)', [settleBookingId]);
      await pool.query('DELETE FROM payment_transactions WHERE booking_id = $1', [settleBookingId]);
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [settleBookingId]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [settleBookingId]);
    });

    // Case 7: Single-product booking, cancel with settlement_action='adjust' →
    //   no adjustment transaction (product excluded from balance), refund for full diff_amount
    it('Case 7: single-product cancel with adjust → no adjustment recorded, refund for full diff_amount', async () => {
      const chargeAccountingService = require('../services/chargeAccountingService');
      // Pay ₹9,000 — all goes to rent (rent_paid=9000, security_paid=0)
      await chargeAccountingService.applyPayment(settleBookingId, 9000, 'Cash', 'test-user', 'Test payment');

      // Penalty = 0% (0-1 days from booking policy) → diff = 9000 - 0 = 9000
      const expectedPenalty = 0;
      const expectedDiff = 9000 - expectedPenalty; // 9000

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [settleBPId],
          cancellation_reason: 'Test',
          cancelled_by: 'test-user',
          settlement_action: 'adjust'
        });

      expect(response.status).toBe(200);
      // diff_amount = 9000 - 0 = 9000
      expect(response.body.total_diff_amount).toBe(expectedDiff);

      // No adjustment transaction recorded (product excluded → balance = 0)
      const txResult = await pool.query(
        `SELECT type FROM payment_transactions WHERE booking_id = $1 ORDER BY transaction_date`,
        [settleBookingId]
      );
      const types = txResult.rows.map(r => r.type);
      expect(types).not.toContain('adjustment');
      // A refund for the full diff should have been issued instead
      expect(types).toContain('refund');
    });

    // Case 8: Two-product booking with non-zero penalty, cancel A with adjust, B has ₹3,000 dues
    it('Case 8: two-product booking, non-zero penalty, cancel A with adjust → adjustment+refund', async () => {
      const chargeAccountingService = require('../services/chargeAccountingService');

      // Set up a specific penalty policy for this test (15% for 4-6 days range)
      const testPenaltyPct = 15;
      await policyService.upsertPolicy({
        policy_key: 'test_settle_case8',
        policy_name: 'Settlement Case 8 penalty',
        policy_type: 'cancellation_penalty',
        value_type: 'percentage',
        value: testPenaltyPct,
        days_from_booking_min: 4,
        days_from_booking_max: 6,
        created_by: 'test-user'
      });

      // Backdate product created_at by 5 days to hit the 4-6 days policy range
      await pool.query(
        `UPDATE booking_products SET created_at = CURRENT_TIMESTAMP - INTERVAL '5 days' WHERE id = $1`,
        [settleBPId]
      );

      // Pay ₹9,000 BEFORE adding product B so the full amount goes to product A's rent
      await chargeAccountingService.applyPayment(settleBookingId, 9000, 'Cash', 'test-user', 'Test payment');

      // Now add product B with ₹3,000 unpaid rent (payment already distributed, won't affect B)
      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 3000, 0)
         RETURNING id`,
        [settleBookingId, testProductId]
      );
      const bp2Id = bp2Result.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 3000, 0)`,
        [bp2Id]
      );

      // Penalty derived from policy: 15% of effective_rent 9200 = 1380
      const rent = 9200;
      const expectedPenalty = Math.floor(rent * testPenaltyPct / 100); // 1380
      const expectedDiff = 9000 - expectedPenalty; // 7620
      const expectedAdjust = Math.min(expectedDiff, 3000); // 3000
      const expectedRefund = expectedDiff - expectedAdjust; // 4620

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [settleBPId],
          cancellation_reason: 'Test',
          cancelled_by: 'test-user',
          settlement_action: 'adjust'
        });

      expect(response.status).toBe(200);
      expect(response.body.total_diff_amount).toBe(expectedDiff);

      const txResult = await pool.query(
        `SELECT type, amount FROM payment_transactions WHERE booking_id = $1 ORDER BY transaction_date`,
        [settleBookingId]
      );
      const txTypes = txResult.rows.map(r => r.type);
      expect(txTypes).toContain('adjustment');
      const adjustTx = txResult.rows.find(r => r.type === 'adjustment');
      expect(parseFloat(adjustTx.amount)).toBe(expectedAdjust); // 3000

      expect(txTypes).toContain('refund');
      const refundTx = txResult.rows.find(r => r.type === 'refund');
      expect(parseFloat(refundTx.amount)).toBe(expectedRefund); // 3700
    });

    // Case 9: Two-product booking, cancel A with refund → refund for full diff_amount, B's dues unchanged
    it('Case 9: two-product booking, cancel A with refund → full refund, product B dues unchanged', async () => {
      const chargeAccountingService = require('../services/chargeAccountingService');
      // Pay ₹9,000 BEFORE adding product B so the full amount goes to product A's rent
      await chargeAccountingService.applyPayment(settleBookingId, 9000, 'Cash', 'test-user', 'Test payment');

      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 3000, 0)
         RETURNING id`,
        [settleBookingId, testProductId]
      );
      const bp2Id = bp2Result.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 3000, 0)`,
        [bp2Id]
      );

      // Penalty = 0% (0-1 days from booking policy) → diff = 9000
      const expectedPenalty = 0;
      const expectedDiff = 9000 - expectedPenalty; // 9000

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [settleBPId],
          cancellation_reason: 'Test',
          cancelled_by: 'test-user',
          settlement_action: 'refund',
          payment_method: 'Cash'
        });

      expect(response.status).toBe(200);
      expect(response.body.total_diff_amount).toBe(expectedDiff);

      const txResult = await pool.query(
        `SELECT type, amount FROM payment_transactions WHERE booking_id = $1 ORDER BY transaction_date`,
        [settleBookingId]
      );
      const txTypes = txResult.rows.map(r => r.type);
      expect(txTypes).not.toContain('adjustment');
      expect(txTypes).toContain('refund');
      const refundTx = txResult.rows.find(r => r.type === 'refund');
      expect(parseFloat(refundTx.amount)).toBe(expectedDiff); // 9000

      // Product B's dues remain unchanged
      const bp2Charges = await pool.query(
        `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1`,
        [bp2Id]
      );
      expect(parseFloat(bp2Charges.rows[0].paid_amount)).toBe(0);
    });

    // Case 10: settlement_action='none' → no settlement transactions recorded
    it('Case 10: settlement_action=none → no payment_transactions recorded for settlement', async () => {
      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [settleBPId],
          cancellation_reason: 'Test',
          cancelled_by: 'test-user',
          settlement_action: 'none'
        });

      expect(response.status).toBe(200);
      expect(response.body.settlement).toBeNull();

      const txResult = await pool.query(
        `SELECT COUNT(*) as cnt FROM payment_transactions WHERE booking_id = $1`,
        [settleBookingId]
      );
      expect(parseInt(txResult.rows[0].cnt)).toBe(0);
    });

    // Case 11: Cancel with non-zero penalty, full rent paid, refund
    it('Case 11: cancel with 20% penalty, full rent paid → refund = rent - penalty', async () => {
      const chargeAccountingService = require('../services/chargeAccountingService');

      // Set up a specific penalty policy for this test (20% for 7-10 days range)
      const testPenaltyPct = 20;
      await policyService.upsertPolicy({
        policy_key: 'test_settle_case11',
        policy_name: 'Settlement Case 11 penalty',
        policy_type: 'cancellation_penalty',
        value_type: 'percentage',
        value: testPenaltyPct,
        days_from_booking_min: 7,
        days_from_booking_max: 10,
        created_by: 'test-user'
      });

      // Backdate product created_at by 8 days to hit the 7-10 days policy range
      await pool.query(
        `UPDATE booking_products SET created_at = CURRENT_TIMESTAMP - INTERVAL '8 days' WHERE id = $1`,
        [settleBPId]
      );

      await chargeAccountingService.applyPayment(settleBookingId, 9200, 'Cash', 'test-user', 'Full rent payment');

      // Penalty derived from policy: 20% of effective_rent 9200 = 1840
      const rent = 9200;
      const expectedPenalty = Math.floor(rent * testPenaltyPct / 100); // 1840
      const expectedDiff = 9200 - expectedPenalty; // 7360

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [settleBPId],
          cancellation_reason: 'Test',
          cancelled_by: 'test-user',
          settlement_action: 'refund',
          payment_method: 'Cash'
        });

      expect(response.status).toBe(200);
      expect(response.body.total_diff_amount).toBe(expectedDiff);

      const txResult = await pool.query(
        `SELECT type, amount FROM payment_transactions WHERE booking_id = $1 AND type = 'refund'`,
        [settleBookingId]
      );
      expect(txResult.rows).toHaveLength(1);
      expect(parseFloat(txResult.rows[0].amount)).toBe(expectedDiff); // 7360
    });

    // Case 12: extra_refund validation — edited refund > total paid → HTTP 400
    it('Case 12: extra_refund that makes edited refund exceed total paid → HTTP 400', async () => {
      const chargeAccountingService = require('../services/chargeAccountingService');
      // Pay ₹5,000 (above 50% minimum of ₹4,600 for rent=9,200)
      await chargeAccountingService.applyPayment(settleBookingId, 5000, 'Cash', 'test-user', 'Partial payment');

      const response = await request(app)
        .post('/cancellation')
        .send({
          booking_product_ids: [settleBPId],
          cancellation_reason: 'Test',
          cancelled_by: 'test-user',
          extra_refund: 50000, // Way too much — edited refund would exceed total paid (₹5,000)
          settlement_action: 'refund'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid extra_refund');

      // No new refund/adjustment transactions recorded
      const txResult = await pool.query(
        `SELECT COUNT(*) as cnt FROM payment_transactions WHERE booking_id = $1 AND type IN ('refund', 'adjustment')`,
        [settleBookingId]
      );
      expect(parseInt(txResult.rows[0].cnt)).toBe(0);
    });

    // Case 13: processCancellationSettlement with empty excludeProductIds → full booking balance included
    it('Case 13: empty excludeProductIds includes all non-cancelled products in balance', async () => {
      const productLifecycleService = require('../services/productLifecycleService');

      const chargeAccountingService = require('../services/chargeAccountingService');
      // Pay ₹9,000 (rent mostly covered, security unpaid)
      await chargeAccountingService.applyPayment(settleBookingId, 9000, 'Cash', 'test-user', 'Test payment');

      // With empty excludeProductIds, the product being settled is NOT excluded —
      // remaining_balance includes the single product's dues (rent+security - paid = 9200+9000-9000 = 9200)
      // adjustAmount = min(8080, 9200) = 8080 → full amount goes to adjustment, no refund
      const result = await productLifecycleService.processCancellationSettlement(
        settleBookingId, 8080, 'adjust', 'Cash', 'test-user', 'Case 13 test',
        null, []  // empty excludeProductIds — product's own dues included
      );

      expect(result.settlement_action).toBe('adjust');
      expect(result.transaction_recorded).toBe(true);

      const txResult = await pool.query(
        `SELECT type, amount FROM payment_transactions WHERE booking_id = $1`,
        [settleBookingId]
      );
      const adjustTx = txResult.rows.find(r => r.type === 'adjustment');
      // With no exclusion and security excluded from non-sec balance:
      // non-sec remaining = rent_remaining (9200-9000=200) + transport(0) = 200
      // autoAdjust = min(8080, 200) = 200 → adjustment of 200, refund of 7880
      expect(adjustTx).toBeDefined();
      expect(parseFloat(adjustTx.amount)).toBe(200);
      // Remainder 8080-200=7880 issued as refund
      const refundTx = txResult.rows.find(r => r.type === 'refund');
      expect(refundTx).toBeDefined();
      expect(parseFloat(refundTx.amount)).toBe(7880);
    });
  });
});
