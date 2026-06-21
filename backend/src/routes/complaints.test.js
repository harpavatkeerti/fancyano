const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use('/complaints', require('./complaints'));

describe('Complaints Routes', () => {
  let testBookingId;
  let testUserId;

  beforeAll(async () => {
    // Create a test user (required by bookings FK)
    const userResult = await pool.query(
      `INSERT INTO users (name, phone, phone_country, username, password, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Test Complaints Customer', '9000000001', 'IN', 'test_complaints_user', 'hash', 'customer']
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
    await pool.query('DELETE FROM complaints WHERE raised_by = $1', ['Test Complaint User']);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
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

  describe('GET /complaints', () => {
    it('should return a list of complaints', async () => {
      const response = await request(app).get('/complaints');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /complaints/:id', () => {
    it('should return 404 for a non-existent complaint', async () => {
      const response = await request(app).get('/complaints/999999');
      expect(response.status).toBe(404);
    });

    it('should return the complaint for a valid id', async () => {
      // Create one to fetch
      const created = await pool.query(
        `INSERT INTO complaints (booking_id, raised_by, title, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [testBookingId, 'Test Complaint User', 'Fetch test complaint']
      );
      const id = created.rows[0].id;

      const response = await request(app).get(`/complaints/${id}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(id);
    });
  });

  describe('PUT /complaints/:id', () => {
    it('should return 404 for a non-existent complaint', async () => {
      const response = await request(app)
        .put('/complaints/999999')
        .send({ status: 'resolved', user_name: 'Admin', user_role: 'admin' });
      expect(response.status).toBe(404);
    });

    it('should update complaint status and log a status_change note', async () => {
      const created = await pool.query(
        `INSERT INTO complaints (booking_id, raised_by, title, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [testBookingId, 'Test Complaint User', 'Status update test']
      );
      const id = created.rows[0].id;

      const response = await request(app)
        .put(`/complaints/${id}`)
        .send({ status: 'in_progress', user_name: 'Admin', user_role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('in_progress');

      // Status change note should have been auto-logged
      const notesResponse = await request(app).get(`/complaints/${id}/notes`);
      expect(notesResponse.status).toBe(200);
      expect(notesResponse.body.length).toBeGreaterThan(0);
      expect(notesResponse.body[0].note_type).toBe('status_change');
    });
  });

  describe('POST /complaints/:id/notes', () => {
    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/complaints/1/notes')
        .send({ user_name: 'Admin' }); // missing user_role and content
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /complaints/:id', () => {
    it('should return 404 for a non-existent complaint', async () => {
      const response = await request(app).delete('/complaints/999999');
      expect(response.status).toBe(404);
    });

    it('should delete an existing complaint', async () => {
      const created = await pool.query(
        `INSERT INTO complaints (booking_id, raised_by, title, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [testBookingId, 'Test Complaint User', 'Delete test complaint']
      );
      const id = created.rows[0].id;

      const response = await request(app).delete(`/complaints/${id}`);
      expect(response.status).toBe(200);

      const check = await pool.query('SELECT id FROM complaints WHERE id = $1', [id]);
      expect(check.rows.length).toBe(0);
    });
  });
});
