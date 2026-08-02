const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

// Create express app for testing — no auth middleware needed for unit tests
const app = express();
app.use(express.json());
app.use('/vendors', require('./vendors'));

describe('Vendors Routes', () => {
  // Cleanup after each test
  afterEach(async () => {
    await pool.query(`DELETE FROM products WHERE code LIKE 'TEST-VEND-ROUTE-PROD-%'`);
    await pool.query(`DELETE FROM vendors WHERE name LIKE 'TEST-VEND-ROUTE-%'`);
  });

  // ──────────────────────────────────────────────────────────────
  // GET /vendors
  // ──────────────────────────────────────────────────────────────
  describe('GET /vendors', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2), ($3, $4)`,
        ['TEST-VEND-ROUTE-ONE', '1111111111', 'TEST-VEND-ROUTE-TWO', '2222222222']
      );
    });

    it('should return all vendors with 200', async () => {
      const res = await request(app).get('/vendors');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(v => v.name === 'TEST-VEND-ROUTE-ONE')).toBe(true);
      expect(res.body.some(v => v.name === 'TEST-VEND-ROUTE-TWO')).toBe(true);
    });

    it('should filter vendors by search query param', async () => {
      const res = await request(app).get('/vendors?search=ROUTE-ONE');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name).toBe('TEST-VEND-ROUTE-ONE');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // GET /vendors/search
  // ──────────────────────────────────────────────────────────────
  describe('GET /vendors/search', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2)`,
        ['TEST-VEND-ROUTE-SEARCH', '3333333333']
      );
    });

    it('should return matching vendors', async () => {
      const res = await request(app).get('/vendors/search?q=ROUTE-SEARCH');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name).toBe('TEST-VEND-ROUTE-SEARCH');
    });

    it('should return 400 for query shorter than 2 chars', async () => {
      const res = await request(app).get('/vendors/search?q=A');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for empty query', async () => {
      const res = await request(app).get('/vendors/search?q=');
      expect(res.status).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // GET /vendors/:id
  // ──────────────────────────────────────────────────────────────
  describe('GET /vendors/:id', () => {
    let vendorId;

    beforeEach(async () => {
      const res = await pool.query(
        `INSERT INTO vendors (name, phone, gst_number) VALUES ($1, $2, $3) RETURNING id`,
        ['TEST-VEND-ROUTE-GETBYID', '4444444444', 'GST456']
      );
      vendorId = res.rows[0].id;
    });

    it('should return vendor by id', async () => {
      const res = await request(app).get(`/vendors/${vendorId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(vendorId);
      expect(res.body.name).toBe('TEST-VEND-ROUTE-GETBYID');
      expect(res.body.gst_number).toBe('GST456');
    });

    it('should return 404 for non-existent vendor', async () => {
      const res = await request(app).get('/vendors/999999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // POST /vendors
  // ──────────────────────────────────────────────────────────────
  describe('POST /vendors', () => {
    it('should create a vendor and return 201', async () => {
      const res = await request(app)
        .post('/vendors')
        .send({
          name: 'TEST-VEND-ROUTE-CREATE',
          phone: '5555555555',
          address: '123 Test Street',
          gst_number: '22AAAAA0000A1Z5',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('TEST-VEND-ROUTE-CREATE');
      expect(res.body.phone).toBe('5555555555');
      expect(res.body.gst_number).toBe('22AAAAA0000A1Z5');
      expect(res.body.id).toBeDefined();
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/vendors')
        .send({ phone: '6666666666' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 when phone is missing', async () => {
      const res = await request(app)
        .post('/vendors')
        .send({ name: 'TEST-VEND-ROUTE-NOPHONE' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 when notes exceed 255 characters', async () => {
      const res = await request(app)
        .post('/vendors')
        .send({
          name: 'TEST-VEND-ROUTE-LONGNOTES',
          phone: '7777777777',
          notes: 'x'.repeat(256),
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // PUT /vendors/:id
  // ──────────────────────────────────────────────────────────────
  describe('PUT /vendors/:id', () => {
    let vendorId;

    beforeEach(async () => {
      const res = await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-VEND-ROUTE-UPDATE', '8888888888']
      );
      vendorId = res.rows[0].id;
    });

    it('should update vendor and return 200', async () => {
      const res = await request(app)
        .put(`/vendors/${vendorId}`)
        .send({
          name: 'TEST-VEND-ROUTE-UPDATED',
          phone: '9999999999',
          address: 'Updated Address',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('TEST-VEND-ROUTE-UPDATED');
      expect(res.body.phone).toBe('9999999999');
      expect(res.body.address).toBe('Updated Address');
    });

    it('should return 404 for non-existent vendor', async () => {
      const res = await request(app)
        .put('/vendors/999999')
        .send({ name: 'X', phone: '0000000000' });

      expect(res.status).toBe(404);
    });

    it('should return 400 when name is set to empty', async () => {
      const res = await request(app)
        .put(`/vendors/${vendorId}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DELETE /vendors/:id
  // ──────────────────────────────────────────────────────────────
  describe('DELETE /vendors/:id', () => {
    let vendorId;

    beforeEach(async () => {
      const res = await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-VEND-ROUTE-DELETE', '1010101010']
      );
      vendorId = res.rows[0].id;
    });

    it('should delete a vendor with no products and return 200', async () => {
      const res = await request(app).delete(`/vendors/${vendorId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent vendor', async () => {
      const res = await request(app).delete('/vendors/999999');
      expect(res.status).toBe(404);
    });

    it('should return 409 when vendor has active products', async () => {
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, vendor_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-VEND-ROUTE-PROD-001', 'Active Product', 10000, 5000, vendorId, 'available']
      );

      const res = await request(app).delete(`/vendors/${vendorId}`);
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
    });

    it('should allow delete when all products are archived', async () => {
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, vendor_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-VEND-ROUTE-PROD-002', 'Archived Product', 10000, 5000, vendorId, 'archived']
      );

      const res = await request(app).delete(`/vendors/${vendorId}`);
      expect(res.status).toBe(200);
    });
  });
});
