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
      `INSERT INTO products (code, name, rent_per_day, security_deposit, category)
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
});
