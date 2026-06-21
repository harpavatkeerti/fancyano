const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use('/feedback', require('./feedback'));

describe('Feedback Routes', () => {
  let testBookingId;
  let testUserId;

  beforeAll(async () => {
    // Create a test user (required by bookings FK)
    const userResult = await pool.query(
      `INSERT INTO users (name, phone, phone_country, username, password, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Test Feedback Customer', '9000000002', 'IN', 'test_feedback_user', 'hash', 'customer']
    );
    testUserId = userResult.rows[0].id;

    // Create a booking linked to the test user
    const bookingResult = await pool.query(
      `INSERT INTO bookings (user_id, booking_date, status)
       VALUES ($1, CURRENT_DATE, 'pending')
       RETURNING id`,
      [testUserId]
    );
    testBookingId = bookingResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM feedback WHERE feedback_by = $1', ['Test Feedback User']);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
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

  describe('GET /feedback', () => {
    it('should return a list of feedback', async () => {
      const response = await request(app).get('/feedback');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /feedback/:id', () => {
    it('should return 404 for a non-existent feedback', async () => {
      const response = await request(app).get('/feedback/999999');
      expect(response.status).toBe(404);
    });

    it('should return the feedback for a valid id', async () => {
      const created = await pool.query(
        `INSERT INTO feedback (booking_id, feedback_by, rating)
         VALUES ($1, $2, $3) RETURNING id`,
        [testBookingId, 'Test Feedback User', 5]
      );
      const id = created.rows[0].id;

      const response = await request(app).get(`/feedback/${id}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(id);
      expect(response.body.rating).toBe(5);
    });
  });

  describe('DELETE /feedback/:id', () => {
    it('should return 404 for a non-existent feedback', async () => {
      const response = await request(app).delete('/feedback/999999');
      expect(response.status).toBe(404);
    });

    it('should delete an existing feedback', async () => {
      const created = await pool.query(
        `INSERT INTO feedback (booking_id, feedback_by, rating)
         VALUES ($1, $2, $3) RETURNING id`,
        [testBookingId, 'Test Feedback User', 3]
      );
      const id = created.rows[0].id;

      const response = await request(app).delete(`/feedback/${id}`);
      expect(response.status).toBe(200);

      const check = await pool.query('SELECT id FROM feedback WHERE id = $1', [id]);
      expect(check.rows.length).toBe(0);
    });
  });
});
