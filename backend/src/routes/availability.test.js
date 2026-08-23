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
  let testBookingId = null;

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
    await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
  });

  afterEach(async () => {
    if (testBookingId) {
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
      testBookingId = null;
    }
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
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, $1, $2, $3, $4)
         RETURNING id`,
        ['2024-01-01', '2024-05-01', '2024-05-10', 'confirmed']
      );
      testBookingId = bookingResult.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testBookingId, testProductId, '2024-05-01', '2024-05-10', 'confirmed', 50000, 20000]
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

  describe('GET /availability/urgent/:bookingId', () => {
    let urgentBookingId;
    let urgentProductId;
    let neighbourBookingId;

    beforeAll(async () => {
      // Create a product for urgency testing
      const productRes = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-URGENT-001', 'Test Urgent Product', 30000, 10000, 'test']
      );
      urgentProductId = productRes.rows[0].id;

      // Create a booking with a product
      const bookingRes = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, $1, $2, $3, $4)
         RETURNING id`,
        ['2024-01-01', '2024-07-10', '2024-07-15', 'confirmed']
      );
      urgentBookingId = bookingRes.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [urgentBookingId, urgentProductId, '2024-07-10', '2024-07-15', 'confirmed', 30000, 10000]
      );

      // Create a neighbouring booking with only 1 day gap (tight schedule)
      const neighbourRes = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, $1, $2, $3, $4)
         RETURNING id`,
        ['2024-01-01', '2024-07-16', '2024-07-20', 'confirmed']
      );
      neighbourBookingId = neighbourRes.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [neighbourBookingId, urgentProductId, '2024-07-16', '2024-07-20', 'confirmed', 30000, 10000]
      );
    });

    afterAll(async () => {
      await pool.query('DELETE FROM booking_products WHERE booking_id IN ($1, $2)', [urgentBookingId, neighbourBookingId]);
      await pool.query('DELETE FROM bookings WHERE id IN ($1, $2)', [urgentBookingId, neighbourBookingId]);
      await pool.query('DELETE FROM products WHERE id = $1', [urgentProductId]);
    });

    it('should return urgency data with conflicts array', async () => {
      const response = await request(app)
        .get(`/availability/urgent/${urgentBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('is_urgent');
      expect(response.body).toHaveProperty('reasons');
      expect(response.body).toHaveProperty('conflicts');
      expect(Array.isArray(response.body.conflicts)).toBe(true);
    });

    it('should return structured conflict data for tight schedules', async () => {
      const response = await request(app)
        .get(`/availability/urgent/${urgentBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body.is_urgent).toBe(true);
      expect(response.body.conflicts.length).toBeGreaterThanOrEqual(1);

      const conflict = response.body.conflicts[0];
      expect(conflict).toHaveProperty('product_code', 'TEST-URGENT-001');
      expect(conflict).toHaveProperty('product_name', 'Test Urgent Product');
      expect(conflict).toHaveProperty('booked_from');
      expect(conflict).toHaveProperty('booked_to');
      expect(conflict).toHaveProperty('neighbour_booking_id');
      expect(conflict).toHaveProperty('neighbour_from');
      expect(conflict).toHaveProperty('neighbour_to');
      expect(conflict).toHaveProperty('gap_days');
      expect(conflict).toHaveProperty('direction');
      expect(['before', 'after']).toContain(conflict.direction);
    });

    it('should return empty conflicts for non-existent booking', async () => {
      const response = await request(app)
        .get('/availability/urgent/999999');

      expect(response.status).toBe(200);
      expect(response.body.is_urgent).toBe(false);
      expect(response.body.conflicts).toEqual([]);
    });
  });
});
