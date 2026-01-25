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

    it('should return residual amount when adjustment exceeds total due', async () => {
      const response = await request(app)
        .post('/payments/adjustment')
        .send({
          booking_id: testBookingId,
          adjustment_amount: 100000, // More than total due (75000)
          payment_method: 'Adjustment',
          reason: 'Large adjustment',
          adjusted_by: 'admin'
        });

      expect(response.status).toBe(200);
      expect(response.body.adjustment_details.total_applied).toBe(75000);
      expect(response.body.adjustment_details.residual_amount).toBe(25000);
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
      const updatedBalance = updatedSummary.body.totals.balance;

      expect(updatedBalance).toBe(initialBalance - 10000);
    });
  });
});
