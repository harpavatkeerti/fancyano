const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use('/complaints', require('./complaints'));

describe('Complaints Routes', () => {
  let testBookingId;

  beforeAll(async () => {
    // Create a real booking to satisfy the foreign key constraint
    const result = await pool.query(
      `INSERT INTO bookings (customer_name, customer_phone, booking_date, status)
       VALUES ($1, $2, CURRENT_DATE, 'pending')
       RETURNING id`,
      ['Test Complaints Customer', '9999900001']
    );
    testBookingId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM complaints WHERE raised_by = $1', ['Test Complaint User']);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
  });

  describe('POST /complaints', () => {
    it('should return 400 when booking_id is missing', async () => {
      const response = await request(app)
        .post('/complaints')
        .send({
          raised_by: 'Test Complaint User',
          title: 'Missing booking id',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/booking_id/i);
    });

    it('should return 400 when raised_by is missing', async () => {
      const response = await request(app)
        .post('/complaints')
        .send({
          booking_id: testBookingId,
          title: 'Missing raised_by',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when title is missing', async () => {
      const response = await request(app)
        .post('/complaints')
        .send({
          booking_id: testBookingId,
          raised_by: 'Test Complaint User',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should create a complaint when all required fields are provided', async () => {
      const response = await request(app)
        .post('/complaints')
        .send({
          booking_id: testBookingId,
          raised_by: 'Test Complaint User',
          title: 'Valid complaint',
          description: 'Something went wrong',
        });

      expect(response.status).toBe(201);
      expect(response.body.booking_id).toBe(testBookingId);
      expect(response.body.raised_by).toBe('Test Complaint User');
      expect(response.body.title).toBe('Valid complaint');
      expect(response.body.status).toBe('pending');
    });
  });
});
