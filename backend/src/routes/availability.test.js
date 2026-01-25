const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const availabilityService = require('../services/availabilityService');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/availability', require('./availability'));

describe('Availability Routes', () => {
  let testProductId;

  beforeAll(async () => {
    // Create test product
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['TEST-AVAIL-ROUTE-001', 'Test Availability Route Product', 50000, 20000, 'test']
    );
    testProductId = productResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = $1)', ['TEST-AVAIL-ROUTE']);
    await pool.query('DELETE FROM bookings WHERE customer_phone = $1', ['TEST-AVAIL-ROUTE']);
    await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = $1)', ['TEST-AVAIL-ROUTE']);
    await pool.query('DELETE FROM bookings WHERE customer_phone = $1', ['TEST-AVAIL-ROUTE']);
  });

  describe('POST /availability/check', () => {
    it('should check product availability', async () => {
      const response = await request(app)
        .post('/availability/check')
        .send({
          product_id: testProductId,
          date_from: '2024-05-01',
          date_to: '2024-05-05'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('available');
      expect(response.body).toHaveProperty('conflicts');
      expect(response.body).toHaveProperty('message');
      expect(response.body.available).toBe(true);
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/availability/check')
        .send({
          product_id: testProductId
          // Missing date_from and date_to
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should detect conflicts', async () => {
      // Create a booking
      const bookingResult = await pool.query(
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, booked_from, booked_to, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        ['Test Customer', 'TEST-AVAIL-ROUTE', '2024-01-01', '2024-05-01', '2024-05-10', 'confirmed']
      );

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [bookingResult.rows[0].id, testProductId, '2024-05-01', '2024-05-10', 'confirmed', 50000, 20000]
      );

      const response = await request(app)
        .post('/availability/check')
        .send({
          product_id: testProductId,
          date_from: '2024-05-03',
          date_to: '2024-05-08'
        });

      expect(response.status).toBe(200);
      expect(response.body.available).toBe(false);
      expect(response.body.conflicts).toHaveLength(1);
    });
  });

  describe('POST /availability/check-bulk', () => {
    it('should check bulk availability', async () => {
      const response = await request(app)
        .post('/availability/check-bulk')
        .send({
          products: [
            {
              product_id: testProductId,
              date_from: '2024-06-01',
              date_to: '2024-06-05'
            }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('all_available');
      expect(response.body.results).toHaveLength(1);
    });

    it('should return 400 when products array is missing', async () => {
      const response = await request(app)
        .post('/availability/check-bulk')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when products is not an array', async () => {
      const response = await request(app)
        .post('/availability/check-bulk')
        .send({
          products: 'not-an-array'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when products array is empty', async () => {
      const response = await request(app)
        .post('/availability/check-bulk')
        .send({
          products: []
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});
