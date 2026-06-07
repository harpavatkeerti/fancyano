const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const imageStorage = require('../services/imageStorage');

// Mock imageStorage
jest.mock('../services/imageStorage');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/products', require('./products'));

describe('Products Routes', () => {
  let testProductId;

  beforeAll(async () => {
    // Setup mock
    imageStorage.saveImage.mockResolvedValue('/uploads/test-image.jpg');
    imageStorage.deleteImage.mockResolvedValue(true);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM products WHERE code LIKE 'TEST-PROD-ROUTE-%'`);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM products WHERE code LIKE 'TEST-PROD-ROUTE-%'`);
  });

  describe('GET /products', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-PROD-ROUTE-001', 'Test Route Product', 10000, 5000, 'test-category']
      );
      testProductId = result.rows[0].id;
    });

    it('should get all products', async () => {
      const response = await request(app).get('/products');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.some(p => p.code === 'TEST-PROD-ROUTE-001')).toBe(true);
    });

    it('should filter products by search', async () => {
      const response = await request(app).get('/products?search=TEST-PROD-ROUTE-001');

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0].code).toBe('TEST-PROD-ROUTE-001');
    });

    it('should filter products by category', async () => {
      const response = await request(app).get('/products?category=test-category');

      expect(response.status).toBe(200);
      expect(response.body.every(p => p.category === 'test-category')).toBe(true);
    });
  });

  describe('GET /products/:id', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['TEST-PROD-ROUTE-002', 'Test Product 2', 15000, 7500]
      );
      testProductId = result.rows[0].id;
    });

    it('should get product by id', async () => {
      const response = await request(app).get(`/products/${testProductId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testProductId);
      expect(response.body.code).toBe('TEST-PROD-ROUTE-002');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app).get('/products/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /products', () => {
    it('should create a new product', async () => {
      const response = await request(app)
        .post('/products')
        .send({
          name: 'New Test Product',
          code: 'TEST-PROD-ROUTE-NEW-001',
          purchase_price: 50000,
          rent: 10000,
          security_deposit: 5000,
          category: 'test'
        });

      expect(response.status).toBe(201);
      expect(response.body.code).toBe('TEST-PROD-ROUTE-NEW-001');
      expect(response.body.name).toBe('New Test Product');
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/products')
        .send({
          name: 'Incomplete Product'
          // Missing code, rent, security_deposit
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 409 for duplicate product code', async () => {
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit)
         VALUES ($1, $2, $3, $4)`,
        ['TEST-PROD-ROUTE-DUP', 'Duplicate Test', 10000, 5000]
      );

      const response = await request(app)
        .post('/products')
        .send({
          name: 'Another Product',
          code: 'TEST-PROD-ROUTE-DUP',
          rent: 10000,
          security_deposit: 5000
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('PUT /products/:id', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['TEST-PROD-ROUTE-UPD', 'To Update', 10000, 5000]
      );
      testProductId = result.rows[0].id;
    });

    it('should update a product', async () => {
      const response = await request(app)
        .put(`/products/${testProductId}`)
        .send({
          name: 'Updated Product',
          code: 'TEST-PROD-ROUTE-UPD',
          rent: 15000,
          security_deposit: 7500,
          category: 'updated'
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Product');
      expect(response.body.rent).toBe(15000);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .put('/products/999999')
        .send({
          name: 'Updated',
          code: 'TEST',
          rent: 10000,
          security_deposit: 5000
        });

      expect(response.status).toBe(404);
    });

    it('should return 400 when security_deposit is missing', async () => {
      const response = await request(app)
        .put(`/products/${testProductId}`)
        .send({
          name: 'Updated Product',
          code: 'TEST-PROD-ROUTE-UPD',
          rent: 15000
          // Missing security_deposit
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('security_deposit');
    });
  });

  describe('PATCH /products/:id/archive', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-PROD-ROUTE-DEL', 'To Archive', 10000, 5000, 'available']
      );
      testProductId = result.rows[0].id;
    });

    it('should archive an available product', async () => {
      const response = await request(app).patch(`/products/${testProductId}/archive`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('archived');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app).patch('/products/999999/archive');

      expect(response.status).toBe(404);
    });

    it('should return 409 when archiving an already archived product', async () => {
      await request(app).patch(`/products/${testProductId}/archive`);
      const response = await request(app).patch(`/products/${testProductId}/archive`);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already archived');
    });
  });

  describe('PATCH /products/:id/restore', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-PROD-ROUTE-DEL', 'To Restore', 10000, 5000, 'archived']
      );
      testProductId = result.rows[0].id;
    });

    it('should restore an archived product', async () => {
      const response = await request(app).patch(`/products/${testProductId}/restore`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('available');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app).patch('/products/999999/restore');

      expect(response.status).toBe(404);
    });

    it('should return 409 when restoring an already available product', async () => {
      await request(app).patch(`/products/${testProductId}/restore`);
      const response = await request(app).patch(`/products/${testProductId}/restore`);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already available');
    });
  });
});
