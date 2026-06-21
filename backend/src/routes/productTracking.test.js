const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/product-tracking', require('./productTracking'));

describe('Product Tracking Routes', () => {
  let testProductId;
  let testProductCode = 'TEST-TRACK-CODE-001';

  beforeAll(async () => {
    // Create a test product to attach tracking to
    const result = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [testProductCode, 'Test Tracking Product', 10000, 5000, 'test']
    );
    testProductId = result.rows[0].id;
  });

  afterAll(async () => {
    // Clean up all test tracking records and test product
    await pool.query('DELETE FROM product_tracking WHERE product_code LIKE $1', ['TEST-TRACK-CODE-%']);
    await pool.query('DELETE FROM products WHERE code LIKE $1', ['TEST-TRACK-CODE-%']);
  });

  afterEach(async () => {
    // Clean up tracking records between tests
    await pool.query('DELETE FROM product_tracking WHERE product_code = $1', [testProductCode]);
  });

  // ─── POST / ────────────────────────────────────────────────────────────

  describe('POST /product-tracking', () => {
    it('should create a tracking record with a valid manual tracking_status', async () => {
      const response = await request(app)
        .post('/product-tracking')
        .send({
          product_id: testProductId,
          product_code: testProductCode,
          tracking_status: 'going_to_dry_clean',
          notes: 'Sending for dry clean',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.tracking_status).toBe('going_to_dry_clean');
      expect(response.body.data.product_code).toBe(testProductCode);
    });

    it('should create a tracking record for repair', async () => {
      const response = await request(app)
        .post('/product-tracking')
        .send({
          product_id: testProductId,
          product_code: testProductCode,
          tracking_status: 'repair',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.tracking_status).toBe('repair');
    });

    it('should require work_description for other_work', async () => {
      const response = await request(app)
        .post('/product-tracking')
        .send({
          product_id: testProductId,
          product_code: testProductCode,
          tracking_status: 'other_work',
          // Missing work_description
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/notes/i);
    });

    it('should reject if tracking_status is missing', async () => {
      const response = await request(app)
        .post('/product-tracking')
        .send({
          product_code: testProductCode,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/tracking_status/i);
    });

    it('should reject lifecycle-only status in_house via POST', async () => {
      const response = await request(app)
        .post('/product-tracking')
        .send({
          product_id: testProductId,
          product_code: testProductCode,
          tracking_status: 'in_house',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/is not allowed/i);
    });

    it('should reject lifecycle-only status picked_by_customer via POST', async () => {
      const response = await request(app)
        .post('/product-tracking')
        .send({
          product_id: testProductId,
          product_code: testProductCode,
          tracking_status: 'picked_by_customer',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/is not allowed/i);
    });
  });

  // ─── GET /current/:productId ────────────────────────────────────────────

  describe('GET /product-tracking/current/:productId', () => {
    it('should return null when product has no tracking history', async () => {
      const response = await request(app).get(`/product-tracking/current/${testProductId}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
    });

    it('should return the latest tracking record', async () => {
      // Insert two tracking records
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'going_to_dry_clean')`,
        [testProductId, testProductCode]
      );
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair')`,
        [testProductId, testProductCode]
      );

      const response = await request(app).get(`/product-tracking/current/${testProductId}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      // Should be the most recent: repair (inserted last)
      expect(response.body.data.tracking_status).toBe('repair');
    });
  });

  // ─── PATCH /:id/return ──────────────────────────────────────────────────

  describe('PATCH /product-tracking/:id/return', () => {
    it('should insert a new in_house row and return it', async () => {
      // Create an "out" record
      const insert = await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair')
         RETURNING id`,
        [testProductId, testProductCode]
      );
      const outId = insert.rows[0].id;

      const response = await request(app)
        .patch(`/product-tracking/${outId}/return`)
        .send({ notes: 'Back from repair' });

      expect(response.status).toBe(200);
      expect(response.body.data.tracking_status).toBe('in_house');
      expect(response.body.data.product_code).toBe(testProductCode);

      // Original record should still exist unchanged
      const original = await pool.query(
        'SELECT tracking_status FROM product_tracking WHERE id = $1',
        [outId]
      );
      expect(original.rows[0].tracking_status).toBe('repair');
    });

    it('should return 404 for non-existent tracking record', async () => {
      const response = await request(app)
        .patch('/product-tracking/999999/return')
        .send({});

      expect(response.status).toBe(404);
    });
  });

  // ─── GET /active ─────────────────────────────────────────────────────────

  describe('GET /product-tracking/active', () => {
    it('should return only non-in_house tracking records (one per product)', async () => {
      // Insert one out record and one in_house record for the same product
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'going_to_dry_clean')`,
        [testProductId, testProductCode]
      );
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'in_house')`,
        [testProductId, testProductCode]
      );
      // Insert another out record (latest for this product = in_house, so should NOT appear)
      // Actually the in_house was inserted last, so the product should NOT appear in active

      const response = await request(app).get('/product-tracking/active');

      expect(response.status).toBe(200);
      const trackCodes = response.body.data.map((r) => r.product_code);
      // Since the latest record for testProductCode is in_house, it should NOT appear
      expect(trackCodes).not.toContain(testProductCode);
    });

    it('should return product when latest tracking is not in_house', async () => {
      // Insert an out record as the latest
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair')`,
        [testProductId, testProductCode]
      );

      const response = await request(app).get('/product-tracking/active');

      expect(response.status).toBe(200);
      const trackCodes = response.body.data.map((r) => r.product_code);
      expect(trackCodes).toContain(testProductCode);
    });
  });

  // ─── GET /product/:productId ─────────────────────────────────────────────

  describe('GET /product-tracking/product/:productId', () => {
    it('should return all tracking records for a product', async () => {
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'going_to_dry_clean')`,
        [testProductId, testProductCode]
      );
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'in_house')`,
        [testProductId, testProductCode]
      );

      const response = await request(app).get(`/product-tracking/product/${testProductId}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
    });
  });

  // ─── DELETE /:id ─────────────────────────────────────────────────────────

  describe('DELETE /product-tracking/:id', () => {
    it('should delete a tracking record', async () => {
      const insert = await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair')
         RETURNING id`,
        [testProductId, testProductCode]
      );
      const id = insert.rows[0].id;

      const response = await request(app).delete(`/product-tracking/${id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(id);

      const check = await pool.query('SELECT id FROM product_tracking WHERE id = $1', [id]);
      expect(check.rows.length).toBe(0);
    });

    it('should return 404 for non-existent record', async () => {
      const response = await request(app).delete('/product-tracking/999999');
      expect(response.status).toBe(404);
    });
  });
});
