const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const policyService = require('../services/policyService');
const bookingService = require('../services/bookingService');
const chargeAccountingService = require('../services/chargeAccountingService');

const app = express();
app.use(express.json());
app.use('/lifecycle', require('./productLifecycle'));

describe('Product Lifecycle Routes', () => {
  let testBookingId;
  let testBookingProductId;
  let testProductId;

  beforeAll(async () => {
    // Create test product
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['TEST-LIFECYCLE-001', 'Test Lifecycle Product', 50000, 20000, 'test']
    );
    testProductId = productResult.rows[0].id;

    // Create test policies
    await policyService.upsertPolicy({
      policy_key: 'test_lifecycle_late_fee',
      policy_name: 'Test Late Fee',
      policy_type: 'late_fee',
      value_type: 'fixed',
      value: 200,
      created_by: 'test'
    });
  });

  beforeEach(async () => {
    // Create fresh booking for each test
    const booking = await bookingService.createBooking({
      customerName: 'Test Customer',
      customerPhone: 'TEST-LIFECYCLE-PHONE',
      customerEmail: 'test@lifecycle.com',
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
    testBookingId = booking.booking_id;

    // Confirm booking
    await bookingService.confirmBooking(testBookingId, 'test-user');

    // Get booking_product_id
    const bpResult = await pool.query(
      'SELECT id FROM booking_products WHERE booking_id = $1',
      [testBookingId]
    );
    testBookingProductId = bpResult.rows[0].id;
  });

  afterEach(async () => {
    // Cleanup
    const testPhones = ['TEST-LIFECYCLE-PHONE', 'TEST-SEC-ADJUST', 'TEST-BALANCE-DUE', 'TEST-PARTIAL', 'TEST-NO-SEC'];
    const phoneList = testPhones.map(p => `'${p}'`).join(',');
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN (${phoneList}))`);
    await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN (${phoneList}))`);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT bp.id FROM booking_products bp JOIN bookings b ON bp.booking_id = b.id WHERE b.customer_phone IN (${phoneList}))`);
    await pool.query(`DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN (${phoneList}))`);
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone IN (${phoneList}))`);
    await pool.query(`DELETE FROM bookings WHERE customer_phone IN (${phoneList})`);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
    await pool.query(`DELETE FROM rental_policies WHERE policy_key LIKE 'test_lifecycle_%'`);
  });

  describe('POST /:bookingId/products/pickup', () => {
    // Test: Successfully picks up products when security is paid
    it('should pickup products when security is fully paid', async () => {
      // Pay enough to cover rent + transport + security (priority order: rent, transport, security)
      await chargeAccountingService.applyPayment(
        testBookingId,
        75000, // 50000 rent + 5000 transport + 20000 security
        'Cash',
        'test-user',
        'Full payment including security'
      );

      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/pickup`)
        .send({
          booking_product_ids: [testBookingProductId],
          picked_up_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pickup_details.picked_up_count).toBe(1);

      // Verify status changed
      const bpCheck = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(bpCheck.rows[0].status).toBe('in_progress');
    });

    // Test: Rejects pickup if security not paid
    it('should reject pickup if security deposit not paid', async () => {
      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/pickup`)
        .send({
          booking_product_ids: [testBookingProductId],
          picked_up_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('security deposit must be paid');
      expect(response.body.details).toHaveProperty('security_pending', 20000);
    });

    // Test: Rejects pickup if product not in confirmed status
    it('should reject pickup if product not confirmed', async () => {
      // Change status to in_progress
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['in_progress', testBookingProductId]
      );

      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/pickup`)
        .send({
          booking_product_ids: [testBookingProductId],
          picked_up_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('status is in_progress');
    });

    // Test: Returns 400 if booking_product_ids missing
    it('should return 400 if booking_product_ids missing', async () => {
      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/pickup`)
        .send({
          picked_up_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /:bookingId/products/return', () => {
    beforeEach(async () => {
      // Pay enough to cover rent + transport + security
      await chargeAccountingService.applyPayment(
        testBookingId,
        75000, // 50000 rent + 5000 transport + 20000 security
        'Cash',
        'test-user',
        'Full payment'
      );
      // Change status to in_progress (picked up)
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['in_progress', testBookingProductId]
      );
    });

    // Test: Successfully returns products
    it('should return products successfully', async () => {
      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/return`)
        .send({
          returns: [
            { booking_product_id: testBookingProductId, damage_fee: 0 }
          ],
          returned_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify status changed
      const bpCheck = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(bpCheck.rows[0].status).toBe('completed');
    });

    // Test: Applies damage fee correctly
    it('should apply damage fee if provided', async () => {
      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/return`)
        .send({
          returns: [
            { booking_product_id: testBookingProductId, damage_fee: 5000 }
          ],
          returned_by: 'test-user'
        });

      expect(response.status).toBe(200);

      // Verify damage fee charge added
      const chargeCheck = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'damage_fee'`,
        [testBookingProductId]
      );
      expect(chargeCheck.rows.length).toBe(1);
      expect(chargeCheck.rows[0].due_amount).toBe(5000);
    });

    // Test: Calculates late fee for delayed returns
    it('should calculate late fee for delayed return', async () => {
      // Set booking dates to past (booked_from must be <= booked_to)
      await pool.query(
        `UPDATE booking_products 
         SET booked_from = CURRENT_DATE - INTERVAL '7 days',
             booked_to = CURRENT_DATE - INTERVAL '2 days' 
         WHERE id = $1`,
        [testBookingProductId]
      );

      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/return`)
        .send({
          returns: [
            { booking_product_id: testBookingProductId, damage_fee: 0 }
          ],
          returned_by: 'test-user'
        });

      expect(response.status).toBe(200);

      // Verify late fee charged (2 days * 200 = 400)
      const chargeCheck = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'late_fee'`,
        [testBookingProductId]
      );
      expect(chargeCheck.rows.length).toBe(1);
      expect(chargeCheck.rows[0].due_amount).toBeGreaterThanOrEqual(400);
    });

    // Test: Rejects return if product not in in_progress status
    it('should reject return if product not in in_progress status', async () => {
      // Change status back to confirmed
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['confirmed', testBookingProductId]
      );

      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/return`)
        .send({
          returns: [
            { booking_product_id: testBookingProductId, damage_fee: 0 }
          ],
          returned_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('not in in_progress status');
    });

    // Test: Returns 400 if returns array missing
    it('should return 400 if returns array missing', async () => {
      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/return`)
        .send({
          returned_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /:bookingId/products/:productId/security-refund/process', () => {
    beforeEach(async () => {
      // Pay enough to cover rent + transport + security
      await chargeAccountingService.applyPayment(
        testBookingId,
        75000,
        'Cash',
        'test-user',
        'Full payment'
      );
      // Set status to completed
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['completed', testBookingProductId]
      );
    });

    it('should process refund successfully', async () => {
      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/${testBookingProductId}/security-refund/process`)
        .send({
          action: 'refund',
          recorded_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.security_return.action).toBe('refund');
      expect(response.body.security_return.transaction_recorded).toBe(true);
      expect(response.body.security_return.refund_amount).toBe(20000);
    });

    it('should process adjustment successfully', async () => {
      // Create booking with unpaid dues
      const booking2 = await bookingService.createBooking({
        customerName: 'Test Adjust',
        customerPhone: 'TEST-SEC-ADJUST',
        customerEmail: 'adjust@test.com',
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
      const bp2Result = await pool.query('SELECT id FROM booking_products WHERE booking_id = $1', [booking2.booking_id]);
      const bp2Id = bp2Result.rows[0].id;

      // Pay security only by directly updating
      await chargeAccountingService.applyPayment(booking2.booking_id, 75000, 'Cash', 'test-user', 'Full payment');
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', bp2Id]);

      const response = await request(app)
        .post(`/lifecycle/${booking2.booking_id}/products/${bp2Id}/security-refund/process`)
        .send({
          action: 'adjust',
          recorded_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.security_return.action).toBe('adjust');
      expect(response.body.security_return.transaction_recorded).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [booking2.booking_id]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [booking2.booking_id]);
    });

    it('should return 400 for invalid action', async () => {
      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/${testBookingProductId}/security-refund/process`)
        .send({
          action: 'invalid',
          recorded_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('must be "refund" or "adjust"');
    });

    it('should return 400 when recorded_by is missing', async () => {
      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/${testBookingProductId}/security-refund/process`)
        .send({
          action: 'refund'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('recorded_by is required');
    });

    it('should return 400 when product is not completed', async () => {
      // Reset status to confirmed
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['confirmed', testBookingProductId]);

      const response = await request(app)
        .post(`/lifecycle/${testBookingId}/products/${testBookingProductId}/security-refund/process`)
        .send({
          action: 'refund',
          recorded_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('status:');
    });
  });

  describe('GET /:bookingId/products/:productId/security-refund/calculate', () => {
    beforeEach(async () => {
      // Pay enough to cover rent + transport + security
      await chargeAccountingService.applyPayment(
        testBookingId,
        75000, // 50000 rent + 5000 transport + 20000 security
        'Cash',
        'test-user',
        'Full payment'
      );
      // Set status to completed (returned)
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['completed', testBookingProductId]
      );
    });

    // Test: Calculates full refund when no balance due
    it('should calculate full refund when no balance due', async () => {
      // All dues already paid in beforeEach (rent + transport + security)
      const response = await request(app)
        .get(`/lifecycle/${testBookingId}/products/${testBookingProductId}/security-refund/calculate`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.security_calculation.refund_amount).toBe(20000);
      expect(response.body.security_calculation.adjusted_amount).toBe(0);
    });

    // Test: Calculates adjustment when balance due exists
    it('should calculate adjustment when balance due exists', async () => {
      // Create new booking with unpaid balance
      const booking2 = await bookingService.createBooking({
        customerName: 'Test Customer 2',
        customerPhone: 'TEST-BALANCE-DUE',
        customerEmail: 'test2@lifecycle.com',
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

      const bpResult2 = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [booking2.booking_id]
      );
      const bp2Id = bpResult2.rows[0].id;

      // Pay only security (security goes to priority #8, so it's paid)
      await chargeAccountingService.applyPayment(
        booking2.booking_id,
        75000, // Pay enough to reach security
        'Cash',
        'test-user',
        'Payment'
      );

      // Set to completed
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['completed', bp2Id]
      );

      const response = await request(app)
        .get(`/lifecycle/${booking2.booking_id}/products/${bp2Id}/security-refund/calculate`);

      expect(response.status).toBe(200);
      // Since all is paid, should refund full security
      expect(response.body.security_calculation.refund_amount).toBe(20000);
      expect(response.body.security_calculation.adjusted_amount).toBe(0);

      // Cleanup
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [booking2.booking_id]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [booking2.booking_id]);
    });

    // Test: Calculates partial adjustment and partial refund
    it('should calculate partial adjustment and partial refund', async () => {
      // Create new booking
      const booking3 = await bookingService.createBooking({
        customerName: 'Test Customer 3',
        customerPhone: 'TEST-PARTIAL',
        customerEmail: 'test3@lifecycle.com',
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

      const bpResult3 = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [booking3.booking_id]
      );
      const bp3Id = bpResult3.rows[0].id;

      // Pay only rent (50000), leaving transport (5000) + security (20000) unpaid
      await chargeAccountingService.applyPayment(
        booking3.booking_id,
        50000,
        'Cash',
        'test-user',
        'Partial payment'
      );

      // Now pay security (goes to priority #8)
      await chargeAccountingService.applyPayment(
        booking3.booking_id,
        25000, // Pay transport (5000) + security (20000)
        'Cash',
        'test-user',
        'Security payment'
      );

      // Set to completed
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['completed', bp3Id]
      );

      const response = await request(app)
        .get(`/lifecycle/${booking3.booking_id}/products/${bp3Id}/security-refund/calculate`);

      expect(response.status).toBe(200);
      const calc = response.body.security_calculation;
      
      // All paid, so full refund
      expect(calc.refund_amount).toBe(20000);
      expect(calc.adjusted_amount).toBe(0);

      // Cleanup
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [booking3.booking_id]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [booking3.booking_id]);
    });

    // Test: Rejects if product not completed
    it('should reject calculation if product not completed', async () => {
      // Change status to in_progress
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['in_progress', testBookingProductId]
      );

      const response = await request(app)
        .get(`/lifecycle/${testBookingId}/products/${testBookingProductId}/security-refund/calculate`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('status:');
    });

    // Test: Handles case when no security was paid
    it('should handle case when no security was paid', async () => {
      // Create new booking without paying security
      const booking4 = await bookingService.createBooking({
        customerName: 'Test Customer 4',
        customerPhone: 'TEST-NO-SEC',
        customerEmail: 'test4@lifecycle.com',
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

      const bpResult4 = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [booking4.booking_id]
      );
      const bp4Id = bpResult4.rows[0].id;

      // Pay only rent, not security
      await chargeAccountingService.applyPayment(
        booking4.booking_id,
        50000,
        'Cash',
        'test-user',
        'Rent only'
      );

      // Set to completed
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['completed', bp4Id]
      );

      const response = await request(app)
        .get(`/lifecycle/${booking4.booking_id}/products/${bp4Id}/security-refund/calculate`);

      expect(response.status).toBe(200);
      expect(response.body.security_calculation.total_security).toBe(0);
      expect(response.body.security_calculation.refund_amount).toBe(0);

      // Cleanup
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [booking4.booking_id]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [booking4.booking_id]);
    });
  });
});
