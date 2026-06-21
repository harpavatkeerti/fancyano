const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const bookingService = require('../services/bookingService');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/payments', require('./paymentTransactions'));

describe('Payment Transactions Routes', () => {
  let testBookingId;
  let testProductId;

  beforeAll(async () => {
    // Create test product
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['TEST-PAY-001', 'Test Payment Product', 50000, 20000, 'test']
    );
    testProductId = productResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE')`);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE'))`);
    await pool.query(`DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE')`);
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE')`);
    await pool.query(`DELETE FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE'`);
    await pool.query(`DELETE FROM products WHERE code = 'TEST-PAY-001'`);
  });

  afterEach(async () => {
    // Cleanup after each test
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE')`);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE'))`);
    await pool.query(`DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE')`);
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE')`);
    await pool.query(`DELETE FROM bookings WHERE customer_phone = 'TEST-PAY-ROUTE'`);
  });

  describe('GET /payments/summary/:bookingId', () => {
    beforeEach(async () => {
      // Create a test booking
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-PAY-ROUTE',
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

    it('should return payment summary for a booking', async () => {
      const response = await request(app).get(`/payments/summary/${testBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('booking_id', testBookingId);
      expect(response.body).toHaveProperty('totals');
      expect(response.body.totals).toHaveProperty('total_due');
      expect(response.body.totals).toHaveProperty('total_paid');
      expect(response.body.totals).toHaveProperty('balance');
      expect(response.body).toHaveProperty('charges');
      expect(response.body.charges).toHaveProperty('transport');
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app).get('/payments/summary/999999');

      expect(response.status).toBe(404);
    });

    it('should include per-product breakdown with booking_product_id and charges as an array', async () => {
      const response = await request(app).get(`/payments/summary/${testBookingId}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.products)).toBe(true);
      expect(response.body.products.length).toBeGreaterThan(0);

      const product = response.body.products[0];

      // booking_product_id must be present — not p.product.id which does not exist on this shape
      expect(product).toHaveProperty('booking_product_id');
      expect(typeof product.booking_product_id).toBe('number');

      // charges must be an array of charge rows, not a nested object like charges.security.paid
      expect(Array.isArray(product.charges)).toBe(true);
      expect(product.charges.length).toBeGreaterThan(0);

      const secCharge = product.charges.find(c => c.charge_type === 'security');
      expect(secCharge).toBeDefined();
      expect(secCharge).toHaveProperty('due_amount');
      expect(secCharge).toHaveProperty('paid_amount');
    });
  });

  describe('POST /payments', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-PAY-ROUTE',
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

      // Confirm booking to create charges
      await bookingService.confirmBooking(testBookingId, 'test-user');
    });

    it('should apply payment to a booking', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          amount: 30000,
          payment_method: 'Cash',
          recorded_by: 'test-user',
          notes: 'Partial payment'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body.payment_details).toHaveProperty('booking_id', testBookingId);
      expect(response.body.payment_details).toHaveProperty('total_applied', 30000);
    });

    it('should apply full payment to a booking', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          amount: 75000, // Full amount (50000 rent + 5000 transport + 20000 security)
          payment_method: 'Card',
          recorded_by: 'test-user',
          notes: 'Full payment'
        });

      expect(response.status).toBe(201);
      expect(response.body.payment_details).toHaveProperty('total_applied', 75000);

      // Verify summary shows fully paid
      const summaryResponse = await request(app).get(`/payments/summary/${testBookingId}`);
      expect(summaryResponse.body.totals.balance).toBe(0);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          payment_method: 'Cash'
          // Missing amount
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if amount is zero or negative', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          amount: 0,
          payment_method: 'Cash',
          recorded_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('amount');
    });

    it('should return 400 when payment amount exceeds outstanding balance', async () => {
      // Total due: 50000 rent + 5000 transport + 20000 security = 75000
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          amount: 80000, // 5000 more than total due
          payment_method: 'Cash',
          recorded_by: 'test-user',
          notes: 'Excess payment attempt'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/exceeds outstanding balance/i);
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: 999999,
          amount: 30000,
          payment_method: 'Cash',
          recorded_by: 'test-user'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /payments/adjustment', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-PAY-ROUTE',
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

    it('should apply adjustment to charges', async () => {
      const response = await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 20000,
          payment_method: 'Adjustment',
          reason: 'Goodwill adjustment',
          adjusted_by: 'admin'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.adjustment_details).toHaveProperty('booking_id', testBookingId);
      expect(response.body.adjustment_details).toHaveProperty('total_applied', 20000);
      expect(response.body.adjustment_details).toHaveProperty('total_applied');
      expect(response.body.adjustment_details).toHaveProperty('residual_amount');
      expect(response.body.adjustment_details).toHaveProperty('breakdown');
    });

    it('should return 400 when adjustment exceeds outstanding balance', async () => {
      // Total due: 50000 rent + 5000 transport + 20000 security = 75000
      const response = await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 100000, // More than total due (75000)
          payment_method: 'Adjustment',
          reason: 'Large adjustment',
          adjusted_by: 'admin'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/exceeds outstanding balance/i);
    });

    it('should apply adjustment following payment priority order', async () => {
      const response = await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 30000,
          payment_method: 'Adjustment',
          reason: 'Partial write-off',
          adjusted_by: 'manager'
        });

      expect(response.status).toBe(200);

      // Verify breakdown shows rent first (priority 1)
      const breakdown = response.body.adjustment_details.breakdown;
      expect(breakdown).toBeDefined();
      expect(breakdown.length).toBeGreaterThan(0);
      expect(breakdown[0].category).toBe('rent');
    });

    it('should create payment transaction record', async () => {
      await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 10000,
          payment_method: 'Cash Adjustment',
          reason: 'Test adjustment',
          adjusted_by: 'admin'
        });

      // Verify transaction was created
      const transaction = await pool.query(
        'SELECT * FROM payment_transactions WHERE booking_id = $1 AND type = $2',
        [testBookingId, 'adjustment']
      );

      expect(transaction.rows).toHaveLength(1);
      expect(transaction.rows[0].method).toBe('Cash Adjustment');
      expect(transaction.rows[0].recorded_by).toBe('admin');
    });

    it('should create activity log entry', async () => {
      await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 15000,
          payment_method: 'Adjustment',
          reason: 'Activity log test',
          adjusted_by: 'admin'
        });

      // Verify activity log was created
      const activityLog = await pool.query(
        'SELECT * FROM booking_activity_log WHERE booking_id = $1 AND event_type = $2',
        [testBookingId, 'adjustment_applied']
      );

      expect(activityLog.rows).toHaveLength(1);
      expect(activityLog.rows[0].performed_by).toBe('admin');
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 10000
          // Missing payment_method and adjusted_by
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should return 400 if adjustment amount is zero or negative', async () => {
      const response = await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 0,
          payment_method: 'Adjustment',
          adjusted_by: 'admin'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('amount');
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: 999999,
          adjustment_amount: 10000,
          payment_method: 'Adjustment',
          reason: 'Test',
          adjusted_by: 'admin'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Booking not found');
    });

    it('should reduce balance in payment summary after adjustment', async () => {
      // Get initial summary
      const initialSummary = await request(app).get(`/payments/summary/${testBookingId}`);
      const initialBalance = initialSummary.body.totals.balance;

      // Apply adjustment
      await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 10000,
          payment_method: 'Adjustment',
          reason: 'Reduce balance',
          adjusted_by: 'admin'
        });

      // Get updated summary
      const updatedSummary = await request(app).get(`/payments/summary/${testBookingId}`);
      // Adjustment reduces outstanding_balance (charge-based), not balance (transaction-based)
      expect(updatedSummary.body.totals.outstanding_balance).toBe(initialSummary.body.totals.outstanding_balance - 10000);
    });
  });

  describe('POST /payments (refund)', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        customerName: 'Test Customer',
        customerPhone: 'TEST-PAY-ROUTE',
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

      // Fully pay the booking first
      await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          amount: 75000,
          payment_method: 'Cash',
          recorded_by: 'test-user',
          notes: 'Full payment'
        });
    });

    it('should record refund with type refund (not payment)', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          amount: 20000,
          type: 'refund',
          method: 'Cash',
          recorded_by: 'admin',
          notes: 'Security refund'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Refund recorded successfully');
      expect(response.body.refund_details).toHaveProperty('booking_id', testBookingId);
      expect(response.body.refund_details).toHaveProperty('amount', 20000);

      // Verify transaction type in DB is 'refund'
      const transaction = await pool.query(
        "SELECT * FROM payment_transactions WHERE booking_id = $1 AND type = 'refund'",
        [testBookingId]
      );
      expect(transaction.rows).toHaveLength(1);
    });

    it('should record refund transaction correctly on a fully paid booking', async () => {
      // Record a refund
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          amount: 20000,
          type: 'refund',
          method: 'Cash',
          recorded_by: 'admin',
          notes: 'Security refund'
        });

      expect(response.status).toBe(201);
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: 999999,
          amount: 5000,
          type: 'refund',
          method: 'Cash',
          recorded_by: 'admin'
        });

      expect(response.status).toBe(404);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: testBookingId,
          type: 'refund'
          // Missing amount, method, recorded_by
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /payments — security_product_ids routing', () => {
    let allocBookingId;
    let bpSmallId; // booking_product with security_deposit = 3000
    let bpLargeId; // booking_product with security_deposit = 9000

    beforeEach(async () => {
      // Two products with rent=0 and no transport so the entire payment goes to security.
      // Non-overlapping date ranges avoid availability conflicts with each other.
      const result = await bookingService.createBooking({
        customerName: 'Alloc Route Test',
        customerPhone: 'TEST-PAY-ROUTE',
        bookingDate: '2024-01-01',
        products: [
          { productId: testProductId, bookedFrom: '2024-02-10', bookedTo: '2024-02-12', rent: 0, securityDeposit: 3000 },
          { productId: testProductId, bookedFrom: '2024-03-10', bookedTo: '2024-03-12', rent: 0, securityDeposit: 9000 },
        ],
        transportCharge: 0,
        createdBy: 'test-user',
      });
      allocBookingId = result.booking_id;
      await bookingService.confirmBooking(allocBookingId, 'test-user');

      const bpResult = await pool.query(
        `SELECT id FROM booking_products WHERE booking_id = $1 ORDER BY security_deposit ASC`,
        [allocBookingId]
      );
      bpSmallId = bpResult.rows[0].id; // security_deposit = 3000
      bpLargeId = bpResult.rows[1].id; // security_deposit = 9000
    });

    it('should return 400 with a descriptive error when selected products cannot absorb the security amount', async () => {
      // bpSmall capacity = 3000; sending 5000 (all security, no rent/transport) → 3000 < 5000
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: allocBookingId,
          amount: 5000,
          payment_method: 'Cash',
          recorded_by: 'test-user',
          security_product_ids: [bpSmallId],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Security allocation insufficient/);
    });

    it('should succeed when selected products capacity exactly equals the security amount', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          booking_id: allocBookingId,
          amount: 3000,
          payment_method: 'Cash',
          recorded_by: 'test-user',
          security_product_ids: [bpSmallId],
        });

      expect(response.status).toBe(201);
      expect(response.body.payment_details).toHaveProperty('total_applied', 3000);
    });

    it('should credit only the selected product and leave the other untouched', async () => {
      await request(app)
        .post('/payments')
        .send({
          booking_id: allocBookingId,
          amount: 3000,
          payment_method: 'Cash',
          recorded_by: 'test-user',
          security_product_ids: [bpSmallId],
        });

      const smallPaid = await pool.query(
        `SELECT paid_amount FROM product_charges
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [bpSmallId]
      );
      const largePaid = await pool.query(
        `SELECT paid_amount FROM product_charges
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [bpLargeId]
      );

      expect(smallPaid.rows[0].paid_amount).toBe(3000); // bpSmall fully credited
      expect(largePaid.rows[0].paid_amount).toBe(0);    // bpLarge untouched
    });
  });
});
