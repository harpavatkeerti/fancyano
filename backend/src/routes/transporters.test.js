/**
 * transporters.test.js
 *
 * Integration tests for GET/POST/PUT/DELETE /transporters routes.
 * Uses a real DB connection — test data uses name prefix 'TEST-TRANS-ROUTE-'
 * to avoid collisions with real data and is cleaned up after each test.
 *
 * Pattern: mirrors vendors.test.js
 */

const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

// Create express app for testing — inject mock auth
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { role: 'admin', id: 'test-user' }; next(); });
app.use('/transporters', require('./transporters'));

describe('Transporters Routes', () => {
  // Cleanup after each test
  afterEach(async () => {
    await pool.query(`DELETE FROM transporters WHERE name LIKE 'TEST-TRANS-ROUTE-%'`);
  });

  // ──────────────────────────────────────────────────────────────
  // GET /transporters
  // ──────────────────────────────────────────────────────────────
  describe('GET /transporters', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO transporters (name, phone) VALUES ($1, $2), ($3, $4)`,
        ['TEST-TRANS-ROUTE-ONE', '9876543210', 'TEST-TRANS-ROUTE-TWO', '9876543211']
      );
    });

    it('should return all non-deleted transporters with 200', async () => {
      const res = await request(app).get('/transporters');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(t => t.name === 'TEST-TRANS-ROUTE-ONE')).toBe(true);
      expect(res.body.some(t => t.name === 'TEST-TRANS-ROUTE-TWO')).toBe(true);
    });

    it('should filter transporters by search query param', async () => {
      const res = await request(app).get('/transporters?search=ROUTE-ONE');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name).toBe('TEST-TRANS-ROUTE-ONE');
    });

    it('should not return soft-deleted transporters', async () => {
      await pool.query(`UPDATE transporters SET is_deleted = TRUE WHERE name = 'TEST-TRANS-ROUTE-ONE'`);
      const res = await request(app).get('/transporters');
      expect(res.body.find(t => t.name === 'TEST-TRANS-ROUTE-ONE')).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // GET /transporters/search
  // ──────────────────────────────────────────────────────────────
  describe('GET /transporters/search', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO transporters (name, phone) VALUES ($1, $2)`,
        ['TEST-TRANS-ROUTE-SEARCH', '9876543212']
      );
    });

    it('should return matching transporters by name', async () => {
      const res = await request(app).get('/transporters/search?q=ROUTE-SEARCH');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name).toBe('TEST-TRANS-ROUTE-SEARCH');
    });

    it('should return matching transporters by phone', async () => {
      const res = await request(app).get('/transporters/search?q=9876543212');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].phone).toBe('9876543212');
    });

    it('should return 400 for query shorter than 2 chars', async () => {
      const res = await request(app).get('/transporters/search?q=A');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for empty query', async () => {
      const res = await request(app).get('/transporters/search?q=');
      expect(res.status).toBe(400);
    });

    it('should return empty array for no matches', async () => {
      const res = await request(app).get('/transporters/search?q=ZZZNOMATCH999');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should not return soft-deleted transporters in search', async () => {
      await pool.query(`UPDATE transporters SET is_deleted = TRUE WHERE name = 'TEST-TRANS-ROUTE-SEARCH'`);
      const res = await request(app).get('/transporters/search?q=ROUTE-SEARCH');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // GET /transporters/:id
  // ──────────────────────────────────────────────────────────────
  describe('GET /transporters/:id', () => {
    let transporterId;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO transporters (name, phone, bus_no) VALUES ($1, $2, $3) RETURNING id`,
        ['TEST-TRANS-ROUTE-GETID', '9876543213', 'GJ05AB1234']
      );
      transporterId = result.rows[0].id;
    });

    it('should return transporter by id', async () => {
      const res = await request(app).get(`/transporters/${transporterId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(transporterId);
      expect(res.body.name).toBe('TEST-TRANS-ROUTE-GETID');
      expect(res.body.bus_no).toBe('GJ05AB1234');
    });

    it('should return 404 for non-existent transporter', async () => {
      const res = await request(app).get('/transporters/9999999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // POST /transporters
  // ──────────────────────────────────────────────────────────────
  describe('POST /transporters', () => {
    it('should create a new transporter and return it', async () => {
      const res = await request(app).post('/transporters').send({
        name: 'TEST-TRANS-ROUTE-CREATE',
        phone: '9876543214',
        phone_country: 'IN',
        bus_no: 'GJ11CD5678',
        notes: 'Test transporter',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('TEST-TRANS-ROUTE-CREATE');
      expect(res.body.phone).toBe('9876543214');
      expect(res.body.bus_no).toBe('GJ11CD5678');
      expect(res.body.is_deleted).toBe(false);
    });

    it('should create transporter with minimal fields', async () => {
      const res = await request(app).post('/transporters').send({
        name: 'TEST-TRANS-ROUTE-MINIMAL',
        phone: '9876543215',
      });

      expect(res.status).toBe(201);
      expect(res.body.phone_country).toBe('IN');
      expect(res.body.bus_no).toBeNull();
      expect(res.body.notes).toBeNull();
    });

    it('should return 400 if name is missing', async () => {
      const res = await request(app).post('/transporters').send({
        phone: '9876543216',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/name/i);
    });

    it('should return 400 if phone is missing', async () => {
      const res = await request(app).post('/transporters').send({
        name: 'TEST-TRANS-ROUTE-NOPHONE',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/phone/i);
    });

    it('should return 400 if IN phone is not 10 digits', async () => {
      const res = await request(app).post('/transporters').send({
        name: 'TEST-TRANS-ROUTE-BADPHONE',
        phone: '12345',
        phone_country: 'IN',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/10 digits/);
    });

    it('should return 400 if notes exceed 255 characters', async () => {
      const res = await request(app).post('/transporters').send({
        name: 'TEST-TRANS-ROUTE-LONGNOTES',
        phone: '9876543217',
        notes: 'x'.repeat(256),
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/255/);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // PUT /transporters/:id
  // ──────────────────────────────────────────────────────────────
  describe('PUT /transporters/:id', () => {
    let transporterId;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO transporters (name, phone, bus_no) VALUES ($1, $2, $3) RETURNING id`,
        ['TEST-TRANS-ROUTE-UPDATE', '9876543218', 'OLD-BUS']
      );
      transporterId = result.rows[0].id;
    });

    it('should update name and bus_no', async () => {
      const res = await request(app).put(`/transporters/${transporterId}`).send({
        name: 'TEST-TRANS-ROUTE-UPDATED',
        bus_no: 'MH12EF1234',
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('TEST-TRANS-ROUTE-UPDATED');
      expect(res.body.bus_no).toBe('MH12EF1234');
    });

    it('should update phone with country validation', async () => {
      const res = await request(app).put(`/transporters/${transporterId}`).send({
        phone: '9999999999',
        phone_country: 'IN',
      });

      expect(res.status).toBe(200);
      expect(res.body.phone).toBe('9999999999');
    });

    it('should return 400 if phone is invalid for country', async () => {
      const res = await request(app).put(`/transporters/${transporterId}`).send({
        phone: '123',
        phone_country: 'IN',
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 if no updatable fields provided', async () => {
      const res = await request(app).put(`/transporters/${transporterId}`).send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no updatable fields/i);
    });

    it('should return 404 for non-existent transporter', async () => {
      const res = await request(app).put('/transporters/9999999').send({ name: 'Nobody' });

      expect(res.status).toBe(404);
    });

    it('should return 404 for soft-deleted transporter', async () => {
      await pool.query(`UPDATE transporters SET is_deleted = TRUE WHERE id = $1`, [transporterId]);

      const res = await request(app).put(`/transporters/${transporterId}`).send({
        name: 'TEST-TRANS-ROUTE-GHOST',
      });

      expect(res.status).toBe(404);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DELETE /transporters/:id
  // ──────────────────────────────────────────────────────────────
  describe('DELETE /transporters/:id', () => {
    let transporterId;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO transporters (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-TRANS-ROUTE-DELETE', '9876543219']
      );
      transporterId = result.rows[0].id;
    });

    it('should soft-delete a transporter', async () => {
      const res = await request(app).delete(`/transporters/${transporterId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);

      // Confirm is_deleted = TRUE in DB
      const dbRes = await pool.query('SELECT is_deleted FROM transporters WHERE id = $1', [transporterId]);
      expect(dbRes.rows[0].is_deleted).toBe(true);
    });

    it('should return 404 for non-existent transporter', async () => {
      const res = await request(app).delete('/transporters/9999999');

      expect(res.status).toBe(404);
    });

    it('should return 404 if already soft-deleted', async () => {
      await request(app).delete(`/transporters/${transporterId}`);
      const res = await request(app).delete(`/transporters/${transporterId}`);

      expect(res.status).toBe(404);
    });
  });
});
