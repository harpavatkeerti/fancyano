const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use('/feedback', require('./feedback'));

describe('Feedback Routes', () => {
  let testBookingId;

  beforeAll(async () => {
    // Create a real booking to satisfy the foreign key constraint
    const result = await pool.query(
      `INSERT INTO bookings (customer_name, customer_phone, booking_date, status)
       VALUES ($1, $2, CURRENT_DATE, 'pending')
       RETURNING id`,
      ['Test Feedback Customer', '9999900002']
    );
    testBookingId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM feedback WHERE feedback_by = $1', ['Test Feedback User']);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
  });

  describe('POST /feedback', () => {
    it('should return 400 when booking_id is missing', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          feedback_by: 'Test Feedback User',
          rating: 4,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/booking_id/i);
    });

    it('should return 400 when feedback_by is missing', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          booking_id: testBookingId,
          rating: 4,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when rating is missing', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          booking_id: testBookingId,
          feedback_by: 'Test Feedback User',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when rating is out of range', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          booking_id: testBookingId,
          feedback_by: 'Test Feedback User',
          rating: 6,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/rating/i);
    });

    it('should create feedback when all required fields are provided', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          booking_id: testBookingId,
          feedback_by: 'Test Feedback User',
          rating: 4,
          description: 'Great experience',
        });

      expect(response.status).toBe(201);
      expect(response.body.booking_id).toBe(testBookingId);
      expect(response.body.feedback_by).toBe('Test Feedback User');
      expect(response.body.rating).toBe(4);
    });
  });
});
